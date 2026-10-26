import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from './api.js';
import type { Config } from './config.js';

export function localApp(_config: Config): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    next();
  });
  return app;
}

export function localOnly(config: Config): express.RequestHandler {
  return (req, _res, next) => {
    if (req.get('host') !== new URL(config.origin).host)
      return next(
        new HttpError(403, 'invalid_host', 'Open the sample using its configured ORIGIN.'),
      );
    const origin = req.get('origin');
    if (origin && origin !== config.origin)
      return next(
        new HttpError(403, 'invalid_origin', 'The request origin does not match ORIGIN.'),
      );
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !origin)
      return next(new HttpError(403, 'origin_required', 'Send an Origin header matching ORIGIN.'));
    next();
  };
}

export const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ error: error.code, message: error.message, requestId: error.requestId });
  } else if (error instanceof z.ZodError || error instanceof SyntaxError) {
    res
      .status(400)
      .json({ error: 'validation_failed', message: 'Check the request fields and JSON encoding.' });
  } else if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
    res.status(413).json({ error: 'payload_too_large' });
  } else {
    res
      .status(500)
      .json({ error: 'internal_error', message: 'The sample could not complete the request.' });
  }
};
