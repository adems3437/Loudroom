/** Shared button looks. Touch targets stay ≥ 56 px on phones (SPEC §12). */
export function buttonClass(
  variant: 'primary' | 'accent' | 'ghost' | 'danger' = 'primary',
  extra = '',
): string {
  const base =
    'inline-flex min-h-touch items-center justify-center gap-2 rounded-2xl px-6 font-semibold transition-[background-color,opacity,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const variants = {
    primary: 'bg-brand text-ink hover:bg-brand-strong',
    accent: 'bg-accent text-canvas hover:opacity-90',
    ghost: 'border border-line bg-surface text-ink hover:bg-surface-raised',
    danger: 'bg-danger text-ink hover:opacity-90',
  };
  return `${base} ${variants[variant]} ${extra}`;
}
