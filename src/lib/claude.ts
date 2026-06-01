export async function callClaudeWithRetry(rawPrompt: string, validate?: (obj: any) => boolean) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('Claude API key not configured');

  const extractJson = (text: string) => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      try { return JSON.parse(text); } catch { return null; }
    }
  };

  const callOnce = async (prompt: string) => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => `status:${resp.status}`);
      throw new Error(`Claude API error: ${resp.status} ${txt}`);
    }
    const json = await resp.json();
    return json.content?.[0]?.text ?? JSON.stringify(json);
  };

  let lastErr: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const text = await callOnce(rawPrompt);
      const parsed = extractJson(text);
      if (parsed && (!validate || validate(parsed))) return parsed;
      lastErr = new Error('Unable to parse valid JSON from Claude');
    } catch (err: any) {
      lastErr = err;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 200));
    }
  }
  throw lastErr ?? new Error('Claude call failed');
}
