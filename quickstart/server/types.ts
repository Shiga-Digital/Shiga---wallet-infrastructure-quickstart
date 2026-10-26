import { z } from 'zod';

export const moduleIds = ['evm_erc4337', 'bitcoin', 'spark', 'solana', 'tron', 'ton'] as const;
export const walletSchema = z
  .object({
    moduleId: z.enum(moduleIds),
    chain: z.string(),
    address: z.string(),
    status: z.enum(['created', 'already_exists', 'failed']),
  })
  .passthrough();
export const credentialSchema = z.object({
  id: z.string().min(1),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]+$/),
  counter: z.number().int().nonnegative(),
});
export const contextSchema = z.object({
  customerId: z.string().min(1),
  credential: credentialSchema,
  wallets: z.array(walletSchema),
  passkeyPublicKey: z.object({ x: z.string(), y: z.string() }).optional(),
  rpId: z.string(),
  origin: z.string(),
});
export type CustomerContext = z.infer<typeof contextSchema>;
export type Credential = z.infer<typeof credentialSchema>;
export const intentSchema = z
  .object({
    moduleId: z.enum(moduleIds),
    chain: z.string().min(1).max(40),
    amount: z
      .string()
      .max(80)
      .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
      .refine((value) => /[1-9]/.test(value)),
    recipientAddress: z.string().min(1).max(150),
    token: z.string().min(1).max(150).default('usdt'),
    tokenMint: z.string().max(150).optional(),
    tokenRoot: z.string().max(150).optional(),
  })
  .strict();
export type Intent = z.infer<typeof intentSchema>;
export interface Pending {
  id: string;
  reference: string;
  challenge: string;
  intent: Intent;
  userOpHash?: string;
  txParams?: Record<string, unknown>;
  expiresAt: number;
  state:
    'prepared' | 'submitting' | 'submitted' | 'uncertain' | 'rejected' | 'confirmed' | 'failed';
  result?: unknown;
}
export interface SessionData {
  customerId?: string;
  reference?: string;
  credential?: Credential;
  wallets?: z.infer<typeof walletSchema>[];
  passkeyPublicKey?: { x: string; y: string };
  registration?: { hash: string; expiresAt: number };
  quote?: { id: string; intent: Intent; expiresAt: number; data: unknown };
  pending?: Pending;
}
