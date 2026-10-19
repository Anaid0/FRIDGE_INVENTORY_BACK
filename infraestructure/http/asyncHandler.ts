import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 no captura promesas rechazadas: este wrapper las envía al errorHandler. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
