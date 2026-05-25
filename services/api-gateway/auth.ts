// ─────────────────────────────────────────────
//  Auth middleware
//  Verifies JWT and attaches user payload to req
// ─────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../../../shared/types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing token' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Token expired' });
    }
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Invalid token' });
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  if (req.user.role !== 'owner') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Owner role required' });
  }
  next();
}
