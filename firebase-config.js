/* firebase-config.js - OPTIONAL (fill this to enable Firebase sync)
Steps to enable Firebase sync:
1. Create a Firebase project at https://console.firebase.google.com/
2. Add a Web app and copy the config object.
3. Paste the config into FIREBASE_CONFIG below and set `useFirebase = true` in script.js or enable auto-detection.
4. Add firebase-init.js to initialize firebase (example provided in firebase-init.js)
Note: This repo does NOT include your API keys. Keep them secret in production (use env vars / server).

Example config (replace with your values):
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef12345"
};
*/
const FIREBASE_CONFIG = null;
export default FIREBASE_CONFIG;
