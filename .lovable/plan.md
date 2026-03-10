

# Fix: Chat Auto-Scroll Hijacking User's Reading Position

## Problem
The `useEffect` on line 55 calls `scrollIntoView` every time `messages` or `currentSpeaker` changes. This forces the chat to the bottom even when the user has scrolled up to read earlier messages.

## Fix

### `src/components/LiveSimulationChat.tsx`

1. **Track whether the user is near the bottom** of the scroll container using an `isNearBottom` ref.
2. **Add an `onScroll` handler** to the chat container div that updates `isNearBottom` — if the user is within ~80px of the bottom, consider them "following" the conversation.
3. **Only auto-scroll when `isNearBottom` is true.** This way, new messages still auto-scroll if you're already at the bottom, but scrolling up to read pauses auto-scroll.
4. Remove `currentSpeaker` from the scroll trigger dependency — typing indicators shouldn't force scroll either.

Roughly:
```typescript
const scrollContainerRef = useRef<HTMLDivElement>(null);
const isNearBottom = useRef(true);

const handleScroll = () => {
  const el = scrollContainerRef.current;
  if (!el) return;
  isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
};

useEffect(() => {
  if (isNearBottom.current) {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}, [messages]);
```

Then attach `ref={scrollContainerRef}` and `onScroll={handleScroll}` to the chat area div.

