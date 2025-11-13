# Kisah Sukses Pro — BestOfTheBest Package

Ini paket **BestOfTheBest** untuk aplikasi *Kisah Sukses Pro*.
Konten penting:
- Nama aplikasi: **Kisah Sukses Pro**
- Backend: dijalankan secara internal (server/server.js)
- Icon & splash placeholder ada di `assets/icons/` dan `assets/splash/`

## Cara menjalankan (development)
1. Install deps
```
npm install
```
2. Jalankan frontend (Vite)
```
npm run dev
```
3. Jalankan Electron (di terminal lain)
```
npm start
```

## Build rilis
1. Build frontend
```
npm run build
```
2. Buat installer
```
npm run dist
```

Pastikan server `server/server.js` executable dan mengikat ke port yang sesuai (default: 3000). Jika ingin menghubungkan ke backend jarak jauh, set `process.env.API_URL` di server atau sesuaikan `electron/main.js`.