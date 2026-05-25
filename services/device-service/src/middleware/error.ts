import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const e = err as any;
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : 500;
  const code = typeof e?.code === 'string' ? e.code : 'INTERNAL_ERROR';
  const message = e?.message ?? 'Internal server error';

  if (statusCode >= 500) console.error(err);

  return res.status(statusCode).json({ code, message });
}
