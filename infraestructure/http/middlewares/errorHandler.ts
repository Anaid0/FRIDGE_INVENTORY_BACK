import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { DomainError, type DomainErrorKind } from '../../../domain';
import type { Logger } from '../../logging/logger';

const STATUS_BY_KIND: Record<DomainErrorKind, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LOCKED: 423,
};

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

const body = (code: string, message: string, details?: unknown): ErrorBody => ({
  error: { code, message, ...(details !== undefined && { details }) },
});

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body('ROUTE_NOT_FOUND', `No existe la ruta ${req.method} ${req.path}`));
};

/** Traduce cualquier error a { error: { code, message, details? } } con su status HTTP. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, _next) => {
    if (err instanceof DomainError) {
      res.status(STATUS_BY_KIND[err.kind]).json(body(err.code, err.message, err.details));
      return;
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
      res.status(400).json(body('VALIDATION_ERROR', 'Datos de entrada inválidos', details));
      return;
    }
    if (err instanceof multer.MulterError) {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      res
        .status(tooLarge ? 413 : 400)
        .json(
          body(
            tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
            tooLarge ? 'El archivo supera 5 MB' : err.message,
          ),
        );
      return;
    }

    const e = err as { type?: string; code?: string; status?: number };
    if (e.type === 'entity.parse.failed') {
      res.status(400).json(body('INVALID_JSON', 'El cuerpo de la petición no es JSON válido'));
      return;
    }
    if (e.type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'La petición es demasiado grande'));
      return;
    }
    // Restricciones de la BD que se escapan de las validaciones (p. ej. carreras con nombres únicos)
    if (e.code === 'P2002') {
      res.status(409).json(body('UNIQUE_CONSTRAINT', 'Ya existe un registro con esos datos'));
      return;
    }
    if (e.code === 'P2003') {
      res
        .status(409)
        .json(body('REFERENCE_CONSTRAINT', 'El registro hace referencia a datos que no existen'));
      return;
    }
    if (e.code === 'P2034') {
      res
        .status(409)
        .json(body('TRANSACTION_CONFLICT', 'Hubo un conflicto con otra operación, intenta de nuevo'));
      return;
    }

    logger.error({ err, method: req.method, url: req.originalUrl }, 'Error no controlado');
    res.status(500).json(body('INTERNAL_ERROR', 'Ocurrió un error inesperado'));
  };
}
