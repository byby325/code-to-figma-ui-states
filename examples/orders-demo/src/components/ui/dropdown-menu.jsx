import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
export function DropdownMenu(props) { return <DropdownMenuPrimitive.Root {...props} />; }
export function DropdownMenuTrigger(props) { return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />; }
export function DropdownMenuContent(props) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content sideOffset={4} className="min-w-40 rounded-md border border-zinc-200 bg-white p-1 shadow-md" {...props} /></DropdownMenuPrimitive.Portal>;
}
export function DropdownMenuItem(props) { return <DropdownMenuPrimitive.Item className="rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-zinc-100" {...props} />; }
