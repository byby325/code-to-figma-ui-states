import { Slot } from '@radix-ui/react-slot';
const variants = {
  default: 'bg-zinc-900 text-white hover:bg-zinc-800',
  outline: 'border border-zinc-200 bg-white hover:bg-zinc-100',
  ghost: 'hover:bg-zinc-100',
};
const sizes = { default: 'h-9 px-4 py-2', sm: 'h-8 px-3 text-xs', icon: 'size-9' };
export function Button({ asChild, variant = 'default', size = 'default', className = '', ...props }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={`inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}
