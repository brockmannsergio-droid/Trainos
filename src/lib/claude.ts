export async function callClaudeWithRetry(rawPrompt: string, validate?: (obj: any) => boolean) {
  const apiKey = process.env.CLAUDE_API_KEY;
  const apiUrl = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/complete';
  if (!apiKey) throw new Error('Claude API key not configured');

  const extractJson = (text: string) => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const substr = text.slice(start, end + 1);
    try {
      return JSON.parse(substr);
    } catch {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }
  };

  const callOnce = async (prompt: string) => {
    const payload = { model: 'claude-v1', prompt, max_tokens: 1500, temperature: 0.2 };
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => `status:${resp.status}`);
      throw new Error(`Claude API error: ${resp.status} ${txt}`);
    }
    const json = await resp.json();
    const text = json.completion ?? json.text ?? json.output ?? JSON.stringify(json);
    return typeof text === 'string' ? text : JSON.stringify(text);
  };

  // Try with exponential backoff for transient API errors
  const maxAttempts = 3;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const text = await callOnce(rawPrompt);
      let parsed = extractJson(text);
      if (parsed && (!validate || validate(parsed))) return parsed;

      // If parsed but failed validate, continue to retry with stricter prompt
      const stricter = `${rawPrompt}\n\nIMPORTANT: If your previous response did not parse as valid JSON matching the schema, respond now with ONLY the valid JSON object (no commentary). Make sure all required keys are present.`;
      const text2 = await callOnce(stricter);
      parsed = extractJson(text2);
      if (parsed && (!validate || validate(parsed))) return parsed;

      lastErr = new Error('Unable to parse valid JSON from Claude responses');
      break; // don't keep retrying if model returned but parsing failed
    } catch (err: any) {
      lastErr = err;
      const backoff = Math.pow(2, attempt) * 200;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
  }

  throw lastErr ?? new Error('Claude call failed');
}
