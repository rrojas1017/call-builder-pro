

# Fix React forwardRef warning from Badge

## Root cause
The console warning "Function components cannot be given refs" originates from `DashboardPage` (not `BillingPage`/`UsageSummary` — the trace was misread). The actual culprit:

- `<Card>` wraps `<Badge>` inside a React Router `<Link>`.
- `Link` forwards a ref to its child.
- `Badge` (`src/components/ui/badge.tsx`) is a **plain function component** with no `forwardRef`, so React warns that the ref will be dropped.

The second warning about `CartesianGrid` comes from recharts internals — not our code, can't be fixed without patching the library, and it's harmless.

## The fix (one file)

**`src/components/ui/badge.tsx`** — convert `Badge` to a `React.forwardRef` component, matching the pattern used by every other shadcn/ui primitive in the project (Card, Button, etc.).

Before:
```tsx
function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

After:
```tsx
const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = "Badge";
```

## What I'm NOT changing
- No changes to `BillingPage.tsx`, `UsageSummary.tsx`, or `DashboardPage.tsx` — the Badge fix resolves the warning everywhere it's used.
- No change to recharts (third-party warning, ignorable).
- No API surface change — `Badge` exports stay identical, all existing usages keep working.

## Expected outcome
- The "Function components cannot be given refs … Check the render method of `DashboardPage`" warning disappears from the console.
- `Badge` now correctly forwards refs anywhere it's nested under `Link`, `Tooltip`, `Popover`, etc.
- Zero behavioral or visual change.

