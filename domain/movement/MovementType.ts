export const MovementType = {
  IN: 'IN',
  OUT: 'OUT',
} as const;

export type MovementType = (typeof MovementType)[keyof typeof MovementType];
