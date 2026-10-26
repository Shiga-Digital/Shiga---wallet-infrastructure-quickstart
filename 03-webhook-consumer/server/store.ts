import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from './api.js';

export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

export class Store {
  readonly db: DatabaseSync;
  private readonly revisions = new WeakMap<object, number>();
  private readonly activeApprovals = new Set<string>();
  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sequence (id INTEGER PRIMARY KEY AUTOINCREMENT); CREATE TABLE IF NOT EXISTS payment_owners (payment_id TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(payment_id, owner)); CREATE TABLE IF NOT EXISTS inbox (event_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, processed INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS observations (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
    if (!this.db.prepare('PRAGMA table_info(sessions)').all().some(row => row.name === 'revision')) this.db.exec('ALTER TABLE sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
  }
  newSession(): { token: string; id: string } {
    const token = randomBytes(32).toString('base64url');
    const id = digest(token);
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions (id, payload, expires) VALUES (?, ?, ?)').run(id, '{}', Date.now() + 3_600_000);
    return { token, id };
  }
  readSession(id: string): unknown {
    const row = this.db.prepare('SELECT payload, revision FROM sessions WHERE id = ? AND expires > ?').get(id, Date.now());
    if (!row) return undefined;
    const payload = JSON.parse(String(row.payload)) as object;
    this.revisions.set(payload, Number(row.revision));
    return payload;
  }
  saveSession(id: string, payload: object): void {
    const revision = this.revisions.get(payload) ?? 0;
    const result = this.db.prepare('UPDATE sessions SET payload = ?, revision = revision + 1 WHERE id = ? AND expires > ? AND revision = ?').run(JSON.stringify(payload), id, Date.now(), revision);
    if (result.changes !== 1) throw new HttpError(409, 'session_changed', 'Another request changed or expired this session. Refresh and reconcile any previous transfer before retrying.');
    this.revisions.set(payload, revision + 1);
  }
  beginApproval(id: string): void { this.activeApprovals.add(id); }
  endApproval(id: string): void { this.activeApprovals.delete(id); }
  approvalIsActive(id: string): boolean { return this.activeApprovals.has(id); }
  nextTransactionId(): number {
    return Number(this.db.prepare('INSERT INTO sequence (id) SELECT MAX(COALESCE(MAX(id), 0) + 1, ?) FROM sequence').run(Date.now()).lastInsertRowid);
  }
  ownPayment(id: string, owner: string): void {
    this.db.prepare('INSERT OR IGNORE INTO payment_owners VALUES (?, ?)').run(id, owner);
  }
  ownsPayment(id: string, owner: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM payment_owners WHERE payment_id = ? AND owner = ?').get(id, owner);
  }
  close(): void { this.db.close(); }
}
