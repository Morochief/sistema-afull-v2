import type { Context } from 'hono';

// Vercel fija x-vercel-forwarded-for / x-real-ip; x-forwarded-for del cliente es falsificable.
// Es una mitigación, no una garantía: el límite por IP es "mejor esfuerzo".
export function ipDe(c: Context): string | undefined {
  const h = (n: string) => c.req.header(n)?.split(',')[0]?.trim() || undefined;
  return h('x-vercel-forwarded-for') ?? h('x-real-ip') ?? h('x-forwarded-for');
}
