import * as TooltipPrimitive from '@radix-ui/react-tooltip';
export function Tooltip({ children, ...props }) { return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>; }
export function TooltipTrigger(props) { return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />; }
export function TooltipContent({ children, ...props }) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={4} className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white" {...props}>{children}</TooltipPrimitive.Content></TooltipPrimitive.Portal>;
}
