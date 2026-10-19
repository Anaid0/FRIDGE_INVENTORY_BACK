export const Role = {
  ADMIN: 'ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export function isRole(value: unknown): value is Role {
  return value === Role.ADMIN || value === Role.EMPLOYEE;
}
