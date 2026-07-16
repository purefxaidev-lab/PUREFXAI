import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

const config = window.PUREFXAI_CONFIG?.firebase || {};
const configured = Boolean(config.apiKey && config.projectId && config.appId);
const modal = document.querySelector('#authModal');
const button = document.querySelector('#authButton');
const form = document.querySelector('#authForm');
const googleButton = document.querySelector('#googleLogin');
const switchButton = document.querySelector('#authSwitch');
const title = document.querySelector('#authTitle');
const errorBox = document.querySelector('#authError');
const email = document.querySelector('#authEmail');
const password = document.querySelector('#authPassword');
let signup = false, currentUser = null, auth = null, db = null;

const open = () => { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); setTimeout(() => email.focus(), 250); };
const close = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); errorBox.textContent = ''; };
document.querySelectorAll('[data-auth-close]').forEach(node => node.addEventListener('click', close));
button.addEventListener('click', () => currentUser ? doSignOut() : open());
switchButton.addEventListener('click', () => {
  signup = !signup; title.textContent = signup ? 'สร้างบัญชี PUREFXAI' : 'ยินดีต้อนรับกลับ';
  form.querySelector('.auth-submit').textContent = signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  switchButton.innerHTML = signup ? 'มีบัญชีแล้ว? <b>เข้าสู่ระบบ</b>' : 'ยังไม่มีบัญชี? <b>สมัครสมาชิก</b>';
});

if (!configured) {
  window.PUREFXAI_AUTH = { configured: false, user: null, open, getToken: async () => null, saveChat: async () => {}, savePreference: async () => {} };
  googleButton.addEventListener('click', () => errorBox.textContent = 'กรุณาตั้งค่า Firebase ใน config.js ก่อน');
  form.addEventListener('submit', event => { event.preventDefault(); errorBox.textContent = 'กรุณาตั้งค่า Firebase ใน config.js ก่อน'; });
} else {
  const app = initializeApp(config); auth = getAuth(app); db = getFirestore(app);
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    window.PUREFXAI_AUTH.user = user;
    button.textContent = user ? `${user.displayName || user.email?.split('@')[0] || 'สมาชิก'} · ออกจากระบบ` : 'เข้าสู่ระบบ';
    button.classList.toggle('user-active', Boolean(user));
    if (user) {
      await setDoc(doc(db, 'users', user.uid), { uid: user.uid, name: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '', lastLoginAt: serverTimestamp() }, { merge: true });
      close();
    }
    dispatchEvent(new CustomEvent('purefxai-auth-changed', { detail: { user } }));
  });
  googleButton.addEventListener('click', () => run(() => signInWithPopup(auth, provider)));
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(() => signup ? createUserWithEmailAndPassword(auth, email.value, password.value) : signInWithEmailAndPassword(auth, email.value, password.value));
  });
  window.PUREFXAI_AUTH = {
    configured: true,
    user: currentUser,
    open,
    getToken: async () => auth.currentUser ? auth.currentUser.getIdToken() : null,
    saveChat: async (role, text, meta = {}) => {
      if (!auth.currentUser || !text) return;
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'chats'), { role, text: text.slice(0, 4000), character: meta.character || 'astra', liveMode: meta.liveMode || 'chat', createdAt: serverTimestamp() });
    },
    savePreference: async (key, value) => {
      if (!auth.currentUser) return;
      await setDoc(doc(db, 'users', auth.currentUser.uid), { preferences: { [key]: value }, updatedAt: serverTimestamp() }, { merge: true });
    },
  };
}

async function run(action) {
  errorBox.textContent = '';
  try { await action(); } catch (error) { errorBox.textContent = friendlyError(error.code); }
}
async function doSignOut() { if (auth) await signOut(auth); }
function friendlyError(code = '') {
  if (code.includes('invalid-credential')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('email-already-in-use')) return 'อีเมลนี้ถูกใช้งานแล้ว';
  if (code.includes('popup-closed')) return 'หน้าต่าง Google ถูกปิดก่อนเข้าสู่ระบบ';
  if (code.includes('weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
  return 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง';
}

dispatchEvent(new CustomEvent('purefxai-auth-ready'));
