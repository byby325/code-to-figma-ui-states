import { Inbox, TriangleAlert } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Skeleton } from './ui/skeleton.jsx';
export function LoadingRows() {
  return <ul className="divide-y divide-zinc-100" aria-busy="true">{[0, 1, 2].map(i => (
    <li key={i} className="flex items-center gap-4 px-4 py-3"><Skeleton className="size-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-24" /></div></li>
  ))}</ul>;
}
export function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Inbox className="size-8 text-zinc-400" />
      <p className="text-sm font-medium">No orders yet</p>
      <p className="text-xs text-zinc-500">Orders appear here as soon as a customer checks out.</p>
    </div>
  );
}
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 border-l-4 border-red-500 bg-red-50 px-4 py-3">
      <TriangleAlert className="mt-0.5 size-4 text-red-600" />
      <div className="flex-1"><p className="text-sm font-medium text-red-800">Couldn't load orders</p><p className="text-xs text-red-700">{message}</p></div>
      <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
    </div>
  );
}
