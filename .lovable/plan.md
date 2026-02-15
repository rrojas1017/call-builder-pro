

## Update Favicon and Link Preview (OG Image)

### Problem
1. The favicon needs to be updated to the cute robot mascot image
2. When sharing links (e.g., on WhatsApp), the preview shows a dark/black image instead of proper branding

### Changes

| File | What |
|------|------|
| `public/favicon.png` | Replace with the uploaded robot mascot image (copied from user-uploads) |
| `public/og-image.png` | Copy the robot mascot image as the Open Graph preview image |
| `index.html` | Update the `og:image` and `twitter:image` meta tags to point to the published domain's `/og-image.png` instead of the current Lovable placeholder URL |

### Detail

**Favicon**: Copy the robot image to `public/favicon.png`, replacing the current one. The existing `<link rel="icon" href="/favicon.png">` in index.html already points there, so no HTML change needed for favicon.

**OG Image (link preview)**: The current meta tags point to `https://lovable.dev/opengraph-image-p98pqg.png` which is a generic Lovable placeholder (shows as dark). We will:
1. Copy the robot image to `public/og-image.png`
2. Update the meta tags to use the published domain URL: `https://call-builder-pro.lovable.app/og-image.png`

Updated meta tags:
```html
<meta property="og:image" content="https://call-builder-pro.lovable.app/og-image.png" />
<meta name="twitter:image" content="https://call-builder-pro.lovable.app/og-image.png" />
```

This ensures that when someone shares a link to the app, the robot mascot appears as the preview image instead of a dark rectangle.

