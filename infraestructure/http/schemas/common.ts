import { z } from 'zod';

// Mensajes de validación en español.
z.config(z.locales.es());

export const id = z.string().trim().min(1).max(36);
export const optionalText = (max: number) => z.string().max(max).nullish();

/** 'YYYY-MM-DD' -> Date a medianoche UTC. */
export const dateOnly = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

/** Fecha/hora ISO (o 'YYYY-MM-DD'). */
export const dateTime = z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), 'Fecha inválida');

/** Booleano en query string: 'true' | 'false'. */
export const queryBoolean = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Dinero como texto "2500.50" o número (el dominio valida los decimales). */
export const money = z.union([z.string().trim().min(1), z.number()]);

export const pagination = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
};

export const dateRangeQuery = {
  from: dateTime.optional(),
  to: dateTime.optional(),
};
