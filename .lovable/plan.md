

# Fix: Page-Level Scroll Jumping During Live Simulation

## Problem
`scrollIntoView()` doesn't just scroll the chat container — it scrolls **all ancestor scrollable elements**, including the page itself. So every new message pushes the entire page down, making it impossible to read.

## Fix

### `src/components/LiveSimulationChat.tsx`

Replace `chatEndRef.current?.scrollIntoView({ behavior: "smooth" })` with direct container scroll:

```typescript
useEffect(() => {
  if (isNearBottom.current) {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }
}, [messages]);
```

This scrolls only the chat container div, not the page. One line change — swap `scrollIntoView` for `scrollTo` on the container.

