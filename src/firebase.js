import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Recovered verbatim from the deployed bundle, so this build talks to the same
// project and the same live data as the original app.
const firebaseConfig = {
  apiKey: 'AIzaSyCdl9OkkuU1NzNEzgVRbjr7TxnELJQmQnQ',
  authDomain: 'astral-memes-zentraa.firebaseapp.com',
  projectId: 'astral-memes-zentraa',
  storageBucket: 'astral-memes-zentraa.firebasestorage.app',
  messagingSenderId: '58954353118',
  appId: '1:58954353118:web:f145d485847c5c5218354f'
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
