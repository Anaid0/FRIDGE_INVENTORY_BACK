import { z } from 'zod';
import {
  dateOnly,
  dateRangeQuery,
  dateTime,
  id,
  money,
  optionalText,
  pagination,
  queryBoolean,
} from './common';

const role = z.enum(['ADMIN', 'EMPLOYEE']);

export const loginSchema = z.object({
  email: z.string().max(150),
  password: z.string().max(200),
});

/** Solo crea administradores; las personas se crean en /people. */
export const registerUserSchema = z.object({
  name: z.string().max(100),
  lastname: z.string().max(100),
  email: z.string().max(150),
  password: z.string().max(200),
  role: z
    .literal('ADMIN', { error: 'Las personas (empleados) se crean en /people con nombre y PIN' })
    .optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().max(100).optional(),
    lastname: z.string().max(100).optional(),
    email: z.string().max(150).optional(),
    password: z.string().max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Envía al menos un campo para actualizar');

const pinField = z.string().max(10);

export const registerPersonSchema = z.object({
  name: z.string().max(100),
  lastname: z.string().max(100),
  pin: pinField,
});

export const updatePersonSchema = z
  .object({
    name: z.string().max(100).optional(),
    lastname: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Envía al menos un campo para actualizar');

export const resetPinSchema = z.object({
  pin: pinField,
  /** Contraseña del admin que restablece el PIN (se verifica de nuevo aunque tenga sesión). */
  adminPassword: z.string().min(1, 'Escribe tu contraseña de administrador').max(200),
});

export const listPeopleQuery = z.object({
  isActive: queryBoolean.optional(),
  search: z.string().trim().max(100).optional(),
});

export const listUsersQuery = z.object({
  role: role.optional(),
  isActive: queryBoolean.optional(),
  search: z.string().trim().max(100).optional(),
});

export const categorySchema = z.object({ name: z.string().max(80) });

export const createProductSchema = z.object({
  name: z.string().max(120),
  description: optionalText(255),
  unit: z.string().max(20).optional(),
  minStock: z.number().int().min(0).optional(),
  categoryId: id.nullish(),
  referencePrice: money.nullish(),
  initialQuantity: z.number().int().min(0).optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().max(120).optional(),
    description: optionalText(255),
    unit: z.string().max(20).optional(),
    minStock: z.number().int().min(0).optional(),
    categoryId: id.nullish(),
    referencePrice: money.nullish(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Envía al menos un campo para actualizar');

export const listProductsQuery = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: id.optional(),
  lowStock: queryBoolean.optional(),
  includeInactive: queryBoolean.optional(),
});

export const stockMovementSchema = z.object({
  productId: id,
  quantity: z.number(),
  note: optionalText(255),
  performedBy: id.nullish(),
});

export const listMovementsQuery = z.object({
  type: z.enum(['IN', 'OUT']).optional(),
  source: z.enum(['MANUAL', 'PURCHASE', 'PURCHASE_VOID']).optional(),
  performedBy: id.optional(),
  registeredBy: id.optional(),
  productId: id.optional(),
  ...dateRangeQuery,
  ...pagination,
});

export const topWithdrawersQuery = z.object({
  /** 'period' = la quincena abierta. */
  period: z.enum(['all', 'month', 'week', 'period']).optional(),
  periodId: id.optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const openPeriodSchema = z.object({
  name: z.string().max(60),
  startDate: dateOnly,
  endDate: dateOnly,
  notes: optionalText(255),
});

/** Pago de un cobro por consumo; sin `amount` se paga todo lo pendiente. */
export const chargePaymentSchema = z.object({
  amount: money.optional(),
  paidAt: dateTime.optional(),
  note: optionalText(255),
});

export const contributionSchema = z.object({
  userId: id,
  amount: money,
  paidAt: dateTime.optional(),
  note: optionalText(255),
});

/** En multipart los campos llegan como texto: `items` viene como JSON. */
const itemsField = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
  z
    .array(
      z.object({
        productId: id,
        quantity: z.coerce.number().optional(),
        unitPrice: money.optional(),
        total: money.optional(),
        packageCount: z.coerce.number().optional(),
        unitsPerPackage: z.coerce.number().optional(),
        packagePrice: money.optional(),
      }),
    )
    .min(1, 'La compra debe tener al menos un producto')
    .max(100),
);

export const registerPurchaseSchema = z.object({
  periodId: id,
  buyerId: id,
  store: optionalText(120),
  purchasedAt: dateTime,
  note: optionalText(255),
  items: itemsField,
});

export const listPurchasesQuery = z.object({
  periodId: id.optional(),
  buyerId: id.optional(),
  productId: id.optional(),
  includeVoided: queryBoolean.optional(),
  ...dateRangeQuery,
  ...pagination,
});

export const reportScopeQuery = z
  .object({ periodId: id.optional(), ...dateRangeQuery })
  .transform((q) => (q.periodId ? { periodId: q.periodId } : { from: q.from, to: q.to }));

export const dateRangeQuerySchema = z.object(dateRangeQuery);

export const pairKioskSchema = z.object({ name: z.string().max(60) });

export const kioskMovementSchema = z.object({
  /** Opcional: la app actual no elige persona, el PIN la identifica (las versiones viejas sí la envían). */
  personId: id.optional(),
  pin: z.string().max(10),
  type: z.enum(['IN', 'OUT']),
  items: z
    .array(z.object({ productId: id, quantity: z.number() }))
    .min(1, 'Elige al menos un producto')
    .max(20),
  note: optionalText(255),
});

export const changeOwnPinSchema = z.object({
  currentPin: z.string().max(10),
  newPin: z.string().max(10),
});
