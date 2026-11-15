const tones = { paid: 'bg-emerald-100 text-emerald-700', pending: 'bg-amber-100 text-amber-700', refunded: 'bg-zinc-100 text-zinc-600' };
export function Badge({ tone = 'pending', children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
