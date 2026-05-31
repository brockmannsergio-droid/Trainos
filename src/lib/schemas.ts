export const weeklyPlanSchema = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      items: {
        type: 'object',
        properties: {
          day: { type: 'string' },
          type: { type: 'string', enum: ['easy','hard','long','rest','tempo'] },
          sport: { type: 'string', enum: ['run','ride','rest'] },
          duration: { type: 'number' },
          zones: { type: 'string' },
          description: { type: 'string' },
          tss: { type: 'number' },
          workout: {
            type: 'object',
            properties: {
              warmup: { type: ['string','null'] },
              main: { type: ['string','null'] },
              cooldown: { type: ['string','null'] },
            },
            required: ['warmup','main','cooldown'],
          },
        },
        required: ['day','type','sport','duration','zones','description','tss','workout'],
      },
    },
  },
  required: ['days'],
};

export const adaptedWorkoutSchema = {
  type: 'object',
  properties: {
    adapted: {
      type: 'object',
      properties: {
        duration: { type: 'number' },
        intensity: { type: 'string' },
        notes: { type: ['string','null'] },
        tss: { type: 'number' },
        warmup: { type: ['string','null'] },
        main: { type: ['string','null'] },
        cooldown: { type: ['string','null'] },
      },
      required: ['duration','intensity','tss'],
    },
    explanation: { type: ['string','null'] },
  },
  required: ['adapted'],
};
