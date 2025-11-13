Kisah Sukses - Versi Canggih (PWA-ready)
========================================

Perubahan utama sudah diterapkan: PWA (manifest + service worker), SEO (meta, JSON-LD), aksesibilitas, edit/import/export, pagination, tags, image attachments, dan stub integrasi Firebase.

Langkah penting sebelum deploy:
1. Ganti domain yang sekarang default: https://kisahsukses.app
   - Periksa index.html, sitemap.xml, robots.txt.
2. Siapkan og-image: og-image.png (sudah dibuat placeholder og-image.svg and maybe og-image.png)
3. (Optional) Aktifkan Firebase: tambahkan FIREBASE_CONFIG di firebase-config.js dan include firebase-init.js plus SDK in index.html.
4. Deploy ke HTTPS (Netlify / Vercel / GitHub Pages).

Files of interest:
- index.html, style.css, script.js
- manifest.json, service-worker.js
- firebase-config.js (fill), firebase-init.js (placeholder)
- og-image.svg (placeholder), og-image.png (if generated)
- favicon.svg, favicon-64.png (possibly generated)

Deployment quickstart (Netlify):
- Drag & drop the project folder to Netlify, or connect repo and set build settings (no build step necessary).
- Ensure publish directory is root; enable HTTPS.
- Optionally add _redirects or netlify.toml for SPA routing.

GitHub Actions (CI) and Netlify/Vercel instructions included in repo helper files.
