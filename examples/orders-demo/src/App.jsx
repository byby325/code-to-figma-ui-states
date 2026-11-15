import { useEffect, useState } from 'react';
import { Filter, Plus, RefreshCw } from 'lucide-react';
import { Button } from './components/ui/button.jsx';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip.jsx';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './components/ui/dropdown-menu.jsx';
import { OrderRow } from './components/OrderRow.jsx';
import { LoadingRows, EmptyState, ErrorState } from './components/States.jsx';

function useOrders() {
  const [state, setState] = useState({ status: 'loading' });
  const load = () => {
    setState({ status: 'loading' });
    fetch('/api/orders')
      .then(async r => { const body = await r.json().catch(() => ({})); if (!r.ok) throw new Error(body.message || `HTTP ${r.status}`); return body; })
      .then(body => setState({ status: 'ready', orders: body.orders }))
      .catch(e => setState({ status: 'error', message: e.message }));
  };
  useEffect(load, []);
  return [state, load];
}

export default function App() {
  const [state, reload] = useOrders();
  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-semibold">Orders</h1>
        <Tooltip>
          <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Refresh" onClick={reload}><RefreshCw className="size-4" /></Button></TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline"><Filter className="size-4" />Filter</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem>Paid</DropdownMenuItem><DropdownMenuItem>Pending</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Button asChild><a href="#new"><Plus className="size-4" />New order</a></Button>
      </header>
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {state.status === 'loading' && <LoadingRows />}
        {state.status === 'error' && <ErrorState message={state.message} onRetry={reload} />}
        {state.status === 'ready' && (state.orders.length ? <ul className="divide-y divide-zinc-100">{state.orders.map(o => <OrderRow key={o.id} order={o} />)}</ul> : <EmptyState />)}
      </section>
    </div>
  );
}
