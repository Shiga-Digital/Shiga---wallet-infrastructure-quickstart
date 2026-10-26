import type { RequestHandler, Response } from 'express';
import { digest, type Store } from './store.js';
import type { Config } from './config.js';
import type { SessionData } from './types.js';

export interface Session { id: string; data: SessionData }
export const session = (res: Response): Session => res.locals.session as Session;

export function sessions(store: Store, config: Config): RequestHandler {
  return (req, res, next) => {
    const cookieName = 'shiga_' + config.port;
    const token = (req.get('cookie') ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const id = token && /^[A-Za-z0-9_-]{43}$/.test(token) ? digest(token) : '';
    const data = id ? store.readSession(id) : undefined;
    if (data) {
      const payload = data as SessionData;
      if (payload.pending?.state === 'submitting' && !store.approvalIsActive(id)) {
        payload.pending.state = 'uncertain';
        store.saveSession(id, payload);
      }
      res.locals.session = { id, data: payload };
    }
    else {
      const created = store.newSession();
      res.cookie(cookieName, created.token, { httpOnly: true, sameSite: 'strict', secure: config.origin.startsWith('https:'), maxAge: 3_600_000, path: '/' });
      res.locals.session = { id: created.id, data: {} };
    }
    next();
  };
}
