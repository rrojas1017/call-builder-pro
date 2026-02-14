

## Fix: Excel File Detection + Robust File Upload

### Problems
1. The upload only accepts CSV but doesn't block Excel (.xlsx/.xls) files at the frontend — when an Excel file is uploaded, it's read as raw text, producing garbage binary data that the AI correctly identifies as unusable, yet the UI still allows importing the 6 "valid" rows (which are junk).
2. The binary content contains invalid Unicode escape sequences that crash the database insert (`unsupported Unicode escape sequence`).

### Changes

**1. Frontend: `src/pages/ListsPage.tsx`**

- Add file type validation in `handleFileSelect` before sending to the edge function:
  - Check the file extension: reject `.xlsx`, `.xls`, `.xlsm`, `.ods` with a helpful toast message ("Please export your spreadsheet as CSV first")
  - Also check if the raw text content contains binary indicators (null bytes, xlsx signatures like `PK\x03\x04`) and reject early
- Sanitize row data before saving: strip any characters that could cause Unicode escape sequence errors in JSONB storage (remove null bytes, control characters)

**2. Backend: `supabase/functions/parse-dial-list/index.ts`**

- Add an early binary detection check after receiving `file_content`:
  - If the content contains null bytes (`\x00`) or starts with the ZIP signature (`PK`), return a 400 error with a clear message: "This appears to be an Excel file. Please save it as CSV first."
- This acts as a safety net even if the frontend check is bypassed

**3. Edge function: Sanitize row data**

- Before returning rows, strip control characters and null bytes from all cell values to prevent the Unicode escape sequence error on database insert

### Technical Details

Frontend validation (in `handleFileSelect`):
```
const ext = file.name.split('.').pop()?.toLowerCase();
if (['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) {
  toast error: "Please export as CSV"
  return
}
```

Backend binary detection (in edge function):
```
if (text includes \x00 or starts with "PK") {
  return 400: "Excel file detected, please convert to CSV"
}
```

Row sanitization (before JSON storage):
```
// Strip null bytes and control chars from all values
value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
```

### What stays the same
- CSV parsing logic unchanged
- AI analysis flow unchanged
- Database schema unchanged
- All existing list display and campaign integration unchanged

