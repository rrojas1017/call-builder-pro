

## Add List Deletion

### What Changes

Add a **Delete** button to each list card on the Lists page. Clicking it opens a confirmation dialog. On confirm, the list is deleted and the UI refreshes.

### Cleanup

The `dial_list_rows` table has a foreign key to `dial_lists` with `ON DELETE CASCADE`, so rows are auto-deleted. Lists referenced by `campaign_lists` also cascade. No manual cleanup needed.

### Technical Details

| File | Change |
|---|---|
| `src/pages/ListsPage.tsx` | Add `Trash2` icon import, `AlertDialog` imports, state for `deletingListId`, a `handleDelete` function, and a delete button on each list card that triggers a confirmation dialog. |

**Delete handler:**
```text
1. Call supabase.from("dial_lists").delete().eq("id", deletingListId)
2. On success: show toast, refresh list via loadLists()
3. On error: show error toast
```

**Confirmation dialog:**
- Title: "Delete List"
- Description: "This will permanently delete this list and all its contact rows. Campaigns using this list will no longer reference it. This cannot be undone."
- Cancel + destructive Delete button

**Button placement:** On each list card, add a `Trash2` icon button to the right side (next to the status badge), using `variant="ghost"` with `text-destructive` styling.

