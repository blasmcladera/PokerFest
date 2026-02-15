import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD9g5vBgBVuq2g0qSFLbjvZ00azJAkjFjM",
  authDomain: "pokerfest-75b56.firebaseapp.com",
  projectId: "pokerfest-75b56",
  storageBucket: "pokerfest-75b56.firebasestorage.app",
  messagingSenderId: "671465507671",
  appId: "1:671465507671:web:302c0d1a8dc660bd4dcc12",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
