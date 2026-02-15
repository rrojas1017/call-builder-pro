

## Fix Link Preview Image for aivoz.io

### Problem
The OG image meta tags reference `https://call-builder-pro.lovable.app/og-image.png` but the app is shared via `https://aivoz.io/`. This domain mismatch can cause link previews to fail or show a dark square.

### Changes

| File | What |
|------|------|
| `index.html` | Update `og:image` and `twitter:image` URLs from `call-builder-pro.lovable.app` to `aivoz.io` |
| `index.html` | Add `og:url` meta tag pointing to `https://aivoz.io/` |
| `index.html` | Add explicit `og:image:width` and `og:image:height` meta tags (1200x630 recommended) |

### Detail

**Meta tag updates in `index.html`:**
```html
<meta property="og:url" content="https://aivoz.io/" />
<meta property="og:image" content="https://aivoz.io/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:image" content="https://aivoz.io/og-image.png" />
```

**After publishing**, WhatsApp caches link previews aggressively. To force a refresh, paste the URL into the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) and click "Scrape Again". WhatsApp uses the same cache.

**Note:** The current robot mascot image is square. For best link preview results, a 1200x630 landscape image is recommended. We can optionally generate a proper OG banner with the robot centered on a branded orange background as a follow-up.

