import { Badge } from './ui/badge.jsx';
const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export function OrderRow({ order }) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium">{order.customer.slice(0, 1)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{order.customer}</p>
        <p className="text-xs text-zinc-500">{order.id} · {order.date}</p>
      </div>
      <Badge tone={order.status}>{order.status}</Badge>
      <p className="w-24 text-right text-sm font-medium">{money(order.total)}</p>
    </li>
  );
}
