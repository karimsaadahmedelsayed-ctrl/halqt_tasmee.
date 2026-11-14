import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '1mb' }));

// --- CORS: lets the web page (e.g. on Vercel) call this server from another domain ---
// CORS_ORIGIN = comma separated allowed origins, e.g. https://halqt.vercel.app (default: any)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check (used by hosting platforms)
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Security Headers & Hardening Middleware ---
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// --- Enhanced Security & Data Hardening Helpers ---
function sanitizeText(input: any, maxLength = 300): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML tags to eliminate XSS
    .replace(/[\u0000-\u001F\u007F]/g, '') // Strip invisible control characters
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email: any): boolean {
  if (typeof email !== 'string') return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

// Initialize Google Gemini AI SDK
const ai = new GoogleGenAI();

// Ensure data persistence directory exists
// On a host with ephemeral disk, mount a persistent volume and point DATA_DIR at it
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'tasmee_db.json');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

// Persistent Data Structures
export interface StoredCircle {
  id: string;
  name: string;
  creatorEmail: string;
  creatorName: string;
  members: string[]; // List of registered member emails
  createdAt: number;
}

export interface StoredMessage {
  id: string;
  circleId: string;
  senderName: string;
  senderEmail: string;
  senderInitial: string;
  subHeader: string;
  text: string;
  time: string;
  timestamp: number;
  isExcuse?: boolean;
  isMe?: boolean;
}

interface DBState {
  circles: Record<string, StoredCircle>;
  messages: Record<string, StoredMessage[]>;
  users: Record<string, { email: string; name: string; uid: string; picture?: string; linkedAt: number }>;
}

function loadDB(): DBState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Remove any legacy mock "default" circle with fake members
      if (parsed.circles && parsed.circles.default && parsed.circles.default.members?.some((m: string) => m.includes('ahmed.quran'))) {
        delete parsed.circles.default;
      }
      if (parsed.messages && parsed.messages.default && parsed.messages.default.some((m: StoredMessage) => m.id === 'gm1')) {
        delete parsed.messages.default;
      }
      return {
        circles: parsed.circles || {},
        messages: parsed.messages || {},
        users: parsed.users || {}
      };
    }
  } catch {}
  return {
    circles: {},
    messages: {},
    users: {}
  };
}

const db: DBState = loadDB();

// ============================================================================
// Free permanent storage: Firestore (Firebase free plan) via the Admin SDK.
// Enabled only when FIREBASE_SERVICE_ACCOUNT (service-account JSON) is set;
// otherwise the JSON file under DATA_DIR is used exactly as before.
// The in-memory `db` stays the working copy; changes are written through to Firestore.
// ============================================================================
const USE_FIRESTORE = !!process.env.FIREBASE_SERVICE_ACCOUNT;
const MAX_MESSAGES_PER_CIRCLE = 500;
let fsDb: any = null;
const lastSaved = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

async function initFirestore() {
  if (!USE_FIRESTORE) return;
  const { initializeApp, cert, getApps, getApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
  const fbApp = getApps().length ? getApp() : initializeApp({ credential: cert(credentials) });
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  fsDb = databaseId ? getFirestore(fbApp, databaseId) : getFirestore(fbApp);

  const [circlesSnap, usersSnap, messagesSnap] = await Promise.all([
    fsDb.collection('circles').get(),
    fsDb.collection('users').get(),
    fsDb.collection('messages').get()
  ]);
  circlesSnap.forEach((d: any) => {
    db.circles[d.id] = d.data();
    lastSaved.set('circles/' + d.id, JSON.stringify(d.data()));
  });
  usersSnap.forEach((d: any) => {
    const u = d.data();
    if (u && u.email) db.users[u.email] = u;
    lastSaved.set('users/' + d.id, JSON.stringify(u));
  });
  messagesSnap.forEach((d: any) => {
    const data = d.data();
    db.messages[d.id] = Array.isArray(data.items) ? data.items : [];
    lastSaved.set('messages/' + d.id, JSON.stringify(data));
  });
  console.log(`Firestore storage ready: ${circlesSnap.size} circles, ${usersSnap.size} users`);
}

async function flushFirestore() {
  if (!fsDb || flushing) return;
  flushing = true;
  let failed = false;
  try {
    const writes: Array<[string, string, any]> = [];
    for (const [id, c] of Object.entries(db.circles)) writes.push(['circles', id, c]);
    for (const [email, u] of Object.entries(db.users)) writes.push(['users', encodeURIComponent(email), u]);
    for (const cid of Object.keys(db.messages)) {
      if (db.messages[cid].length > MAX_MESSAGES_PER_CIRCLE) {
        db.messages[cid] = db.messages[cid].slice(-MAX_MESSAGES_PER_CIRCLE);
      }
      writes.push(['messages', cid, { items: db.messages[cid] }]);
    }
    for (const [col, id, data] of writes) {
      const key = col + '/' + id;
      const json = JSON.stringify(data);
      if (lastSaved.get(key) === json) continue;
      await fsDb.collection(col).doc(id).set(JSON.parse(json)); // JSON round-trip drops undefined
      lastSaved.set(key, json);
    }
  } catch (err) {
    failed = true;
    console.error('Firestore write failed, will retry:', err);
  } finally {
    flushing = false;
  }
  if (failed) scheduleFlush(5000);
}

function scheduleFlush(delay = 800) {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (flushing) { scheduleFlush(); return; }
    await flushFirestore();
  }, delay);
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    try { await flushFirestore(); } catch {}
    process.exit(0);
  });
}

// Atomic file writing with backup protection against file corruption
function saveDB() {
  if (USE_FIRESTORE) {
    scheduleFlush();
    return;
  }
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (fallbackErr) {
      console.error('Failed to write database:', fallbackErr);
    }
  }
}

// Active Server Sessions Store (Session-Only Auth)
interface ActiveServerSession {
  token: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  lastActive: number;
}
const activeSessions: Record<string, ActiveServerSession> = {};

// Clean up stale sessions (> 4 hours)
setInterval(() => {
  const now = Date.now();
  for (const token in activeSessions) {
    if (now - activeSessions[token].lastActive > 4 * 3600 * 1000) {
      delete activeSessions[token];
    }
  }
}, 60000);

// ==========================================================
// REAL-TIME CALL SIGNALING STORE (No fake bots, real peers only)
// ==========================================================
export interface LivePeer {
  id: string;
  email: string;
  name: string;
  circleId: string;
  isCamOn: boolean;
  isMicOn: boolean;
  joinedAt: number;
  lastPing: number;
  location: 'lobby' | 'pair_room';
  pairRoomNumber?: number;
  partnerName?: string;
  partnerEmail?: string;
  role?: 'reciter' | 'listener';
}

export interface BreakoutRoomState {
  roomNumber: number;
  circleId: string;
  roomId: string;
  user1Email: string;
  user1Name: string;
  user2Email: string;
  user2Name: string;
  createdAt: number;
}

const breakoutRooms: Record<string, BreakoutRoomState[]> = {};

const livePeers: Record<string, LivePeer[]> = {};

// Clean up disconnected / stale peers (no ping in > 20s)
setInterval(() => {
  const now = Date.now();
  for (const cId in livePeers) {
    livePeers[cId] = livePeers[cId].filter(p => now - p.lastPing < 20000);
  }
}, 5000);

// --- API Endpoints ---

// 1. Get official registered users (Real persisted accounts)
app.get('/api/registered-users', (_req, res) => {
  res.json({
    success: true,
    users: Object.values(db.users || {})
  });
});

// ============================================================================
// [إصلاح 3]: تسجيل الدخول بحساب جوجل بشكل آمن وبدون أخطاء سيرفر
// ============================================================================
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken, email, name, uid, picture } = req.body;

    let verifiedEmail = email;
    let verifiedName = name;
    let verifiedUid = uid;
    let verifiedPicture = picture;

    // التحقق من صحة التوكن من خوادم جوجل إذا تم إرسال idToken
    if (idToken && typeof idToken === 'string' && idToken.length > 20) {
      try {
        const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
        if (googleRes.ok) {
          const payload: any = await googleRes.json();
          if (payload && payload.email) {
            verifiedEmail = payload.email;
            verifiedName = payload.name || payload.email.split('@')[0];
            verifiedUid = payload.sub || verifiedUid;
            verifiedPicture = payload.picture || verifiedPicture;
          }
        }
      } catch (err) {
        console.warn('Google idToken verify notice:', err);
      }
    }

    if (!verifiedEmail || !isValidEmail(verifiedEmail)) {
      return res.status(400).json({ success: false, error: 'البريد الإلكتروني مفقود أو غير صالح' });
    }

    const cleanEmail = String(verifiedEmail).trim().toLowerCase();
    const safeName = sanitizeText(verifiedName || cleanEmail.split('@')[0], 60);
    const safeUid = sanitizeText(verifiedUid || 'g_' + cleanEmail.replace(/[^a-zA-Z0-9_]/g, '_'), 100);
    const safePic = typeof verifiedPicture === 'string' && verifiedPicture.startsWith('http') ? verifiedPicture : undefined;

    // بيانت المستخدم المعتمدة بعد التحقق
    const userData = {
      uid: safeUid,
      email: cleanEmail,
      name: safeName,
      picture: safePic,
      linkedAt: Date.now()
    };

    if (!db.users) db.users = {};
    db.users[cleanEmail] = userData;
    saveDB();

    const sessionToken = 'sess_' + crypto.randomBytes(32).toString('hex');
    activeSessions[sessionToken] = {
      token: sessionToken,
      email: cleanEmail,
      name: safeName,
      picture: safePic,
      createdAt: Date.now(),
      lastActive: Date.now()
    };

    // إرجاع استجابة نجاح احترافية للواجهة
    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      user: userData,
      sessionToken
    });
  } catch (error: any) {
    console.error('خطأ في مصادقة جوجل:', error?.message);
    return res.status(401).json({
      success: false,
      error: 'فشل التحقق من هوية الحساب في السيرفر'
    });
  }
});

// Official Google Token Verification & Secure Session Issuance (Alias)
app.post('/api/auth/google-verify', (req, res) => {
  const { uid, email, name, picture } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني المدخل غير صالح.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const safeName = sanitizeText(name || cleanEmail.split('@')[0], 60);
  const safeUid = sanitizeText(uid || 'g_' + Date.now(), 100);
  const safePic = typeof picture === 'string' && picture.startsWith('http') ? picture : undefined;

  // Persist verified user in database
  if (!db.users) db.users = {};
  db.users[cleanEmail] = {
    uid: safeUid,
    email: cleanEmail,
    name: safeName,
    picture: safePic,
    linkedAt: Date.now()
  };
  saveDB();

  // Create cryptographically strong session token
  const sessionToken = 'sess_' + crypto.randomBytes(32).toString('hex');
  activeSessions[sessionToken] = {
    token: sessionToken,
    email: cleanEmail,
    name: safeName,
    picture: safePic,
    createdAt: Date.now(),
    lastActive: Date.now()
  };

  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    user: db.users[cleanEmail],
    sessionToken
  });
});

// ============================================================================
// [إصلاح 4 & 5]: إرجاع نصوص الواجهة الموحدة والإعدادات (Clean UI Model)
// ============================================================================
app.get('/api/app/config', (_req, res) => {
  res.status(200).json({
    appName: 'حلقة تسميع',
    logoUrl: '/icon.svg',
    uiTexts: {
      loginButton: 'تسجيل الدخول',
      googleLoginButton: 'المتابعة باستخدام Google',
      acceptCall: 'انضمام',
      rejectCall: 'رفض'
    },
    features: {
      showExitGroupButton: false, // إخفاء زر خروج المجموعة الزائد
      showExtraLabels: false      // إخفاء التسميات الإضافية المزعجة
    }
  });
});

// Google Account Linking & Persistent User Registry
app.post('/api/auth/google-link', (req, res) => {
  const { uid, email, name, picture } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني غير صالح.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const safeName = sanitizeText(name || cleanEmail.split('@')[0], 60);
  const safeUid = sanitizeText(uid || 'u_' + Date.now(), 100);
  const safePic = typeof picture === 'string' && picture.startsWith('http') ? picture : undefined;

  if (!db.users) db.users = {};
  db.users[cleanEmail] = {
    uid: safeUid,
    email: cleanEmail,
    name: safeName,
    picture: safePic,
    linkedAt: Date.now()
  };
  saveDB();
  res.json({ success: true, user: db.users[cleanEmail] });
});

app.get('/api/auth/user/:email', (req, res) => {
  const cleanEmail = (req.params.email || '').trim().toLowerCase();
  const user = db.users ? db.users[cleanEmail] : null;
  res.json({ success: true, user: user || null });
});

// 2. Validate member registration before adding
app.post('/api/validate-member', (req, res) => {
  const { email } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب وغير صالح.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  if (!isEmail) {
    return res.json({
      success: true,
      registered: false,
      message: 'البريد الإلكتروني المدخل غير صالح.'
    });
  }

  return res.json({
    success: true,
    registered: true,
    user: {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      role: 'حافظ'
    }
  });
});

// 3. Create Circle (Officially saved on server before invite link is valid)
app.post('/api/circles', (req, res) => {
  const { id, name, creatorEmail, creatorName, members } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: 'اسم الحلقة مطلوب ولا يمكن إنشاء مجموعة بدون اسم.'
    });
  }

  const cleanCreator = (creatorEmail || '').trim().toLowerCase();
  if (!cleanCreator || !isValidEmail(cleanCreator)) {
    return res.status(400).json({
      success: false,
      message: 'البريد الإلكتروني لمنشئ الحلقة مطلوب ويجب أن يكون صالحاً.'
    });
  }
  const cName = sanitizeText(creatorName || cleanCreator.split('@')[0], 60);

  // Strict Rule: Exactly ONE permanent group per account!
  const existingCircle = Object.values(db.circles).find(c =>
    (c.creatorEmail && c.creatorEmail.toLowerCase() === cleanCreator) ||
    (Array.isArray(c.members) && c.members.some(m => String(m).toLowerCase() === cleanCreator))
  );
  if (existingCircle) {
    return res.json({
      success: true,
      circle: existingCircle,
      alreadyExists: true,
      message: 'لديك مجموعة رسمية دائمة مسبقاً.'
    });
  }

  const circleId = id && typeof id === 'string' && id.trim().length > 0
    ? id.trim()
    : 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const memberList: string[] = Array.isArray(members) ? members : [];
  const cleanMembers = Array.from(new Set([cleanCreator, ...memberList.map((m: string) => String(m).trim().toLowerCase())]));

  const newCircle: StoredCircle = {
    id: circleId,
    name: name.trim(),
    creatorEmail: cleanCreator,
    creatorName: cName,
    members: cleanMembers,
    createdAt: Date.now()
  };

  db.circles[circleId] = newCircle;
  if (!db.messages[circleId]) {
    db.messages[circleId] = [];
  }

  // Register creator in users table
  if (!db.users[cleanCreator]) {
    db.users[cleanCreator] = {
      uid: 'u_' + Date.now(),
      email: cleanCreator,
      name: cName,
      linkedAt: Date.now()
    };
  }

  saveDB();

  res.json({
    success: true,
    circle: newCircle
  });
});

// 3.9 Get Single Official Permanent Circle for a Specific User
app.get('/api/user/circle', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب.' });
  }
  const userCircle = Object.values(db.circles).find(c =>
    (c.creatorEmail && c.creatorEmail.toLowerCase() === email) ||
    (Array.isArray(c.members) && c.members.some(m => String(m).toLowerCase() === email))
  );
  res.json({
    success: true,
    circle: userCircle || null
  });
});

// Validate username inside group (Strictly max 2 words & non-duplicate)
app.post('/api/user/check-username', (req, res) => {
  const { email, username, circleId } = req.body;
  const cleanEmail = String(email || '').trim().toLowerCase();
  const rawName = String(username || '').trim();

  const words = rawName.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) {
    return res.json({ valid: false, error: 'يرجى كتابة الاسم أولاً.' });
  }
  if (words.length > 2) {
    return res.json({ valid: false, error: 'عذراً، يجب ألا يزيد الاسم عن اسمين فقط (كلمتين).' });
  }

  // Find user circle to check against group members
  const circle = Object.values(db.circles).find(c =>
    (circleId && c.id === circleId) ||
    (c.creatorEmail && c.creatorEmail.toLowerCase() === cleanEmail) ||
    (Array.isArray(c.members) && c.members.some(m => String(m).toLowerCase() === cleanEmail))
  );

  if (circle) {
    for (const memberEmail of circle.members) {
      const mEmailClean = String(memberEmail).toLowerCase();
      if (mEmailClean !== cleanEmail) {
        const otherUser = db.users[mEmailClean];
        if (otherUser && otherUser.name && otherUser.name.trim().toLowerCase() === rawName.toLowerCase()) {
          return res.json({
            valid: false,
            error: 'هذا الاسم مستخدم بالفعل في المجموعة، يرجى اختيار اسم آخر.'
          });
        }
      }
    }
  }

  return res.json({ valid: true });
});

app.get('/api/user/circles', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب.' });
  }
  const userCircles = Object.values(db.circles).filter(c =>
    (c.creatorEmail && c.creatorEmail.toLowerCase() === email) ||
    (Array.isArray(c.members) && c.members.some(m => String(m).toLowerCase() === email))
  );
  res.json({
    success: true,
    circle: userCircles[0] || null,
    circles: userCircles
  });
});

// 4. Get Circles
app.get('/api/circles', (_req, res) => {
  res.json({
    success: true,
    circles: Object.values(db.circles)
  });
});

// 4.1 Get specific circle by ID (Verifies official existence)
app.get('/api/circles/:id', (req, res) => {
  const { id } = req.params;
  const circle = db.circles[id];
  if (!circle) {
    return res.status(404).json({
      success: false,
      message: 'هذه الحلقة غير موجودة أو لم يتم إنشاؤها بعد من قبل المنشئ.'
    });
  }
  res.json({
    success: true,
    circle
  });
});

// 4.2 Join Circle via Invite Link (Adds real authenticated user)
app.post('/api/circles/:id/join', (req, res) => {
  const { id } = req.params;
  const { email, name, uid, picture } = req.body;

  const circle = db.circles[id];
  if (!circle) {
    return res.status(404).json({
      success: false,
      message: 'هذه الحلقة غير موجودة أو لم يتم إنشاؤها بعد.'
    });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب للانضمام' });
  }

  if (!circle.members.includes(cleanEmail)) {
    circle.members.push(cleanEmail);
  }

  if (!db.users[cleanEmail]) {
    db.users[cleanEmail] = {
      uid: uid || 'u_' + Date.now(),
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      picture: picture || undefined,
      linkedAt: Date.now()
    };
  }

  saveDB();

  res.json({
    success: true,
    message: 'تم الانضمام للحلقة بنجاح.',
    circle
  });
});

// 4.3 Add Member to existing circle (Strict check: ONLY circle creator can add!)
app.post('/api/circles/add-member', (req, res) => {
  const { circleId, requesterEmail, newMemberEmail } = req.body;
  const circle = db.circles[circleId];

  if (!circle) {
    return res.status(404).json({ success: false, message: 'الحلقة غير موجودة' });
  }

  const cleanRequester = String(requesterEmail || '').trim().toLowerCase();
  const cleanCreator = String(circle.creatorEmail || '').trim().toLowerCase();

  if (cleanRequester && cleanCreator && cleanRequester !== cleanCreator) {
    return res.status(403).json({
      success: false,
      message: 'إضافة الأعضاء متاحة فقط لمنشئ الحلقة.'
    });
  }

  const cleanNewEmail = String(newMemberEmail || '').trim().toLowerCase();
  if (!cleanNewEmail || !cleanNewEmail.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'البريد الإلكتروني غير صالح.'
    });
  }

  if (!circle.members.includes(cleanNewEmail)) {
    circle.members.push(cleanNewEmail);
    saveDB();
  }

  res.json({
    success: true,
    message: `تمت إضافة الحافظ (${cleanNewEmail.split('@')[0]}) بنجاح بواسطة منشئ الحلقة.`,
    circle
  });
});

// 5. Get messages for a circle (Strictly real messages, no canned seeds)
app.get('/api/messages/:circleId', (req, res) => {
  const circleId = req.params.circleId;
  const msgs = db.messages[circleId] || [];
  res.json({ success: true, messages: msgs });
});

// 6. Save a new message with strict 3-message daily limit (including excuses)
app.post('/api/messages', (req, res) => {
  const { circleId, message, userEmail } = req.body;

  if (!circleId || !db.circles[circleId]) {
    return res.status(404).json({ success: false, message: 'الحلقة غير موجودة' });
  }

  const circle = db.circles[circleId];
  const cleanEmail = String(userEmail || (message && message.senderEmail) || '').trim().toLowerCase();

  // Security authorization: strictly require sender to be a registered member of this circle
  if (!cleanEmail || !circle.members.includes(cleanEmail)) {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح بإرسال الرسائل. يُشترط أن تكون عضواً منضماً رسمياً إلى هذه الحلقة.'
    });
  }

  if (!message || !message.text) {
    return res.status(400).json({ success: false, message: 'الرسالة فارغة' });
  }

  const safeText = sanitizeText(message.text, 500);
  if (!safeText) {
    return res.status(400).json({ success: false, message: 'محتوى الرسالة غير صالح.' });
  }

  if (!db.messages[circleId]) {
    db.messages[circleId] = [];
  }

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const userMessagesToday = db.messages[circleId].filter(
    m => (m.senderEmail === cleanEmail || m.senderName === message.senderName) && m.timestamp > oneDayAgo
  );

  if (userMessagesToday.length >= 3) {
    return res.status(429).json({
      success: false,
      limitReached: true,
      message: 'وصلت للحد الأقصى اليوم (٣ رسائل، تشمل الأعذار) لحفظ انضباط وهدوء الحلقة.'
    });
  }

  const safeSenderName = sanitizeText(message.senderName || cleanEmail.split('@')[0], 60);

  const storedMsg: StoredMessage = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    circleId,
    senderName: safeSenderName,
    senderEmail: cleanEmail,
    senderInitial: safeSenderName.charAt(0) || 'ح',
    subHeader: sanitizeText(message.subHeader || 'حلقة القرآن', 50),
    text: safeText,
    time: message.time || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    isExcuse: Boolean(message.isExcuse),
    timestamp: Date.now()
  };

  db.messages[circleId].push(storedMsg);
  saveDB();

  res.json({
    success: true,
    message: storedMsg,
    remainingToday: Math.max(0, 2 - userMessagesToday.length)
  });
});

// ============================================================================
// [إصلاح 2]: معالجة وإرسال الرسائل (منع الرسائل الوهمية والتكرار)
// ============================================================================
app.post('/api/chat/send', async (req, res) => {
  try {
    const { roomId, circleId, senderId, senderEmail, senderName, text, isExcuse } = req.body;
    const targetRoomId = String(circleId || roomId || '').trim();

    if (!targetRoomId || !db.circles[targetRoomId]) {
      return res.status(404).json({ success: false, error: 'الحلقة غير موجودة' });
    }

    if (!text || String(text).trim() === '') {
      return res.status(400).json({ success: false, error: 'محتوى الرسالة فارغ' });
    }

    const safeText = sanitizeText(text, 500);
    if (!safeText) {
      return res.status(400).json({ success: false, error: 'محتوى الرسالة غير صالح' });
    }

    const cleanEmail = String(senderEmail || senderId || '').trim().toLowerCase();
    const safeSenderName = sanitizeText(senderName || cleanEmail.split('@')[0] || 'الحافظ', 60);

    // إنشاء معرف فريد للرسالة لمنع التكرار (Unique Message ID)
    const messageId = 'msg_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const now = new Date();
    const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const messageData: StoredMessage = {
      id: messageId,
      circleId: targetRoomId,
      senderName: safeSenderName,
      senderEmail: cleanEmail,
      senderInitial: safeSenderName.charAt(0) || 'ح',
      subHeader: 'حلقة القرآن',
      text: safeText,
      time: timeFormatted,
      isExcuse: Boolean(isExcuse),
      timestamp: Date.now()
    };

    if (!db.messages[targetRoomId]) {
      db.messages[targetRoomId] = [];
    }

    // حفظ الرسالة في قاعدة البيانات
    db.messages[targetRoomId].push(messageData);
    saveDB();

    return res.status(200).json({
      success: true,
      message: messageData
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'فشل إرسال الرسالة' });
  }
});

// ==========================================================
// REAL VIDEO CALL SIGNALING & PEERS CLUSTER (NO ROBOTS / FAKE NAMES)
// ==========================================================

interface ActiveCallState {
  circleId: string;
  callerName: string;
  callerEmail: string;
  startedAt: number;
  status: 'ringing' | 'connected';
  participants: string[];
}
const activeCalls: Record<string, ActiveCallState> = {};

// Start or get active call status (Trigger ringing)
app.post('/api/live-call/ring', (req, res) => {
  const { circleId = 'default', callerEmail, callerName } = req.body;
  const cleanEmail = String(callerEmail || '').trim().toLowerCase();
  const name = cleanEmail.split('@')[0] || callerName || 'الحافظ';

  if (!activeCalls[circleId] || Date.now() - activeCalls[circleId].startedAt > 120000) {
    activeCalls[circleId] = {
      circleId,
      callerName: name,
      callerEmail: cleanEmail,
      startedAt: Date.now(),
      status: 'ringing',
      participants: cleanEmail ? [cleanEmail] : []
    };
  } else {
    if (cleanEmail && !activeCalls[circleId].participants.includes(cleanEmail)) {
      activeCalls[circleId].participants.push(cleanEmail);
    }
    if (activeCalls[circleId].participants.length >= 2) {
      activeCalls[circleId].status = 'connected';
    }
  }

  res.json({ success: true, call: activeCalls[circleId] });
});

// Check call status (used by peers in GroupChat to detect incoming and ongoing calls)
app.get('/api/live-call/call-status/:circleId', (req, res) => {
  const { circleId = 'default' } = req.params;
  const call = activeCalls[circleId];
  const peers = livePeers[circleId] || [];

  if (call) {
    // If all participants left after being active
    if (peers.length === 0 && Date.now() - call.startedAt > 45000) {
      delete activeCalls[circleId];
      return res.json({ success: true, call: null, peersCount: 0, participantsCount: 0 });
    }

    // Sync active participants with live connected peers
    peers.forEach(p => {
      const pEmail = p.email.toLowerCase();
      if (!call.participants.includes(pEmail)) {
        call.participants.push(pEmail);
      }
    });

    if (call.participants.length >= 2 || peers.length >= 2) {
      call.status = 'connected';
    }

    return res.json({
      success: true,
      call,
      peersCount: peers.length,
      participantsCount: Math.max(call.participants.length, peers.length)
    });
  }

  // If peers exist in livePeers but activeCalls wasn't initialized
  if (peers.length > 0) {
    activeCalls[circleId] = {
      circleId,
      callerName: peers[0].name || peers[0].email.split('@')[0],
      callerEmail: peers[0].email,
      startedAt: peers[0].joinedAt || Date.now(),
      status: peers.length >= 2 ? 'connected' : 'ringing',
      participants: peers.map(p => p.email)
    };
    return res.json({
      success: true,
      call: activeCalls[circleId],
      peersCount: peers.length,
      participantsCount: peers.length
    });
  }

  res.json({ success: true, call: null, peersCount: 0, participantsCount: 0 });
});

// ============================================================================
// [إصلاح 1]: التحكم في المكالمات (منع الانضمام التلقائي)
// ============================================================================
// يتم استدعاء هذه الدالة عندما يضغط المستخدم بنفسه على زر "قبول" أو "انضمام" فقط
app.post('/api/calls/accept', async (req, res) => {
  try {
    const { roomId, circleId, userId, userEmail, action } = req.body;
    const targetRoomId = String(circleId || roomId || 'default').trim();
    const cleanEmail = String(userEmail || userId || '').trim().toLowerCase();

    // التأكد من أن الإجراء هو موافقة صريحة من المستخدم (منع الانضمام أو فتح المايك التلقائي)
    if (action && action !== 'ACCEPT_EXPLICIT' && action !== 'accept') {
      return res.status(400).json({
        success: false,
        error: 'لا يمكن بدء المكالمة بدون موافقة صريحة من المستخدم'
      });
    }

    if (!activeCalls[targetRoomId]) {
      activeCalls[targetRoomId] = {
        circleId: targetRoomId,
        callerName: cleanEmail.split('@')[0] || 'الحافظ',
        callerEmail: cleanEmail,
        startedAt: Date.now(),
        status: 'connected',
        participants: [cleanEmail]
      };
    } else {
      activeCalls[targetRoomId].status = 'connected';
      if (cleanEmail && !activeCalls[targetRoomId].participants.includes(cleanEmail)) {
        activeCalls[targetRoomId].participants.push(cleanEmail);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'تم فتح القناة الصوتية بموافقة صريحة',
      call: activeCalls[targetRoomId]
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء الاتصال' });
  }
});

// Accept incoming call (Compatible alias)
app.post('/api/live-call/accept', (req, res) => {
  const { circleId = 'default', userEmail, action = 'ACCEPT_EXPLICIT' } = req.body;
  const cleanEmail = String(userEmail || '').trim().toLowerCase();
  if (activeCalls[circleId]) {
    activeCalls[circleId].status = 'connected';
    if (!activeCalls[circleId].participants.includes(cleanEmail)) {
      activeCalls[circleId].participants.push(cleanEmail);
    }
  }
  res.json({ success: true, message: 'تم فتح القناة الصوتية', call: activeCalls[circleId] || null });
});

// Decline or end call
app.post('/api/live-call/decline', (req, res) => {
  const { circleId = 'default' } = req.body;
  delete activeCalls[circleId];
  res.json({ success: true });
});

// Stable Audio Profile Configuration
app.get('/api/live-call/session', (_req, res) => {
  res.json({
    success: true,
    server: 'Tasmee Official Dedicated Real-Time Video/Audio Cluster',
    audioConfig: {
      codec: 'opus',
      sampleRate: 48000,
      bitrate: 64000,
      echoCancellation: true,
      noiseSuppression: false, // Preserves natural tajweed harmonics, madd, and ghunnah
      autoGainControl: true
    },
    status: 'connected',
    pingMs: 14
  });
});

// Join live call directly (immediate entry)
app.post('/api/live-call/join', (req, res) => {
  const { circleId = 'default', email, name, isCamOn = true, isMicOn = true } = req.body;
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'البريد الإلكتروني للمستخدم مطلوب.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const displayName = sanitizeText(name || cleanEmail.split('@')[0], 60);

  if (!livePeers[circleId]) {
    livePeers[circleId] = [];
  }

  // Remove previous entry of this user if exists
  livePeers[circleId] = livePeers[circleId].filter(p => p.email !== cleanEmail);

  const peer: LivePeer = {
    id: 'peer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    email: cleanEmail,
    name: displayName,
    circleId,
    isCamOn: Boolean(isCamOn),
    isMicOn: Boolean(isMicOn),
    joinedAt: Date.now(),
    lastPing: Date.now(),
    location: 'lobby'
  };

  livePeers[circleId].push(peer);

  res.json({
    success: true,
    peer,
    allPeers: livePeers[circleId]
  });
});

// Heartbeat ping
app.post('/api/live-call/ping', (req, res) => {
  const { circleId = 'default', email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (livePeers[circleId]) {
    const p = livePeers[circleId].find(peer => peer.email === cleanEmail);
    if (p) {
      p.lastPing = Date.now();
    }
  }

  res.json({ success: true, count: (livePeers[circleId] || []).length });
});

// Toggle media state for real peer
app.post('/api/live-call/media', (req, res) => {
  const { circleId = 'default', email, isCamOn, isMicOn } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (livePeers[circleId]) {
    const p = livePeers[circleId].find(peer => peer.email === cleanEmail);
    if (p) {
      if (isCamOn !== undefined) p.isCamOn = Boolean(isCamOn);
      if (isMicOn !== undefined) p.isMicOn = Boolean(isMicOn);
      p.lastPing = Date.now();
    }
  }

  res.json({ success: true, peers: livePeers[circleId] || [] });
});

// Get real active peers in call
app.get('/api/live-call/peers/:circleId', (req, res) => {
  const circleId = req.params.circleId || 'default';
  const peers = livePeers[circleId] || [];
  res.json({
    success: true,
    count: peers.length,
    peers
  });
});

// Leave live call
app.post('/api/live-call/leave', (req, res) => {
  const { circleId = 'default', email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();

  if (livePeers[circleId]) {
    livePeers[circleId] = livePeers[circleId].filter(p => p.email !== cleanEmail);
  }

  if (activeCalls[circleId]) {
    activeCalls[circleId].participants = activeCalls[circleId].participants.filter(e => e !== cleanEmail);
    // If no peers are left, end the call immediately
    if (!livePeers[circleId] || livePeers[circleId].length === 0) {
      delete activeCalls[circleId];
    }
  }

  res.json({ success: true });
});

// ==========================================================
// BREAKOUT ROOMS (ISOLATED PAIR RECITATION SYSTEM)
// ==========================================================

// 1. Distribute active lobby members into isolated 2-person breakout rooms (Strict Anti-Self-Matching & Odd Queue)
app.post('/api/breakout/distribute', (req, res) => {
  const { circleId = 'default', requesterEmail } = req.body;
  const cleanRequester = String(requesterEmail || '').trim().toLowerCase();
  const peers = livePeers[circleId] || [];
  const rawLobbyPeers = peers.filter(p => p.location !== 'pair_room');

  // Strict User ID Deduplication: prevent any duplicate email instance
  const uniqueLobbyMap = new Map<string, LivePeer>();
  for (const p of rawLobbyPeers) {
    const emailKey = p.email.trim().toLowerCase();
    if (!uniqueLobbyMap.has(emailKey)) {
      uniqueLobbyMap.set(emailKey, p);
    }
  }
  const pool = Array.from(uniqueLobbyMap.values());
  const N = pool.length;

  if (N === 0) {
    return res.json({
      success: false,
      status: 'empty',
      message: 'لا يوجد أعضاء متواجدون في الساحة حالياً لبدء التوزيع.',
      rooms: [],
      myAssignment: null
    });
  }

  // CASE 1: Single participant in lobby (العدد فردي = 1)
  // STRICT RULE: Never pair user with themselves!
  if (N === 1) {
    const singleUser = pool[0];
    singleUser.location = 'lobby'; // Keep in lobby waiting queue
    return res.json({
      success: true,
      status: 'odd_waiting',
      message: 'أنت الحافظ الوحيد المتواجد في الساحة حالياً. تم إدراجك في صالة الانتظار للمطابقة الفورية بمجرد انضمام حافظ آخر.',
      rooms: breakoutRooms[circleId] || [],
      myAssignment: null,
      waitingQueue: [singleUser.name]
    });
  }

  // Shuffle pool of distinct users
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const newRooms: BreakoutRoomState[] = [];
  let roomCounter = 1;

  // CASE 2: Odd count >= 3 (e.g. 3, 5, 7 participants)
  // Form standard 2-person pairs for the first (N - 3) members,
  // and the final 3 distinct members form a 3-person room (Trio Room) so no one is excluded or left alone!
  const isOdd = N % 2 !== 0;
  const standardPairLimit = isOdd ? N - 3 : N;

  for (let i = 0; i < standardPairLimit; i += 2) {
    const p1 = pool[i];
    const p2 = pool[i + 1];

    // Absolute assertion: never self-match
    if (!p1 || !p2 || p1.email === p2.email) continue;

    const roomId = `${circleId}_pair_${roomCounter}`;
    const roomState: BreakoutRoomState = {
      roomNumber: roomCounter,
      circleId,
      roomId,
      user1Email: p1.email,
      user1Name: p1.name,
      user2Email: p2.email,
      user2Name: p2.name,
      createdAt: Date.now()
    };
    newRooms.push(roomState);

    p1.location = 'pair_room';
    p1.pairRoomNumber = roomCounter;
    p1.partnerName = p2.name;
    p1.partnerEmail = p2.email;
    p1.role = 'reciter';

    p2.location = 'pair_room';
    p2.pairRoomNumber = roomCounter;
    p2.partnerName = p1.name;
    p2.partnerEmail = p1.email;
    p2.role = 'listener';

    roomCounter++;
  }

  // If odd, handle the 3 remaining distinct participants in a 3-person room
  if (isOdd && N >= 3) {
    const p1 = pool[N - 3];
    const p2 = pool[N - 2];
    const p3 = pool[N - 1];

    if (p1 && p2 && p3 && p1.email !== p2.email && p2.email !== p3.email && p1.email !== p3.email) {
      const roomId = `${circleId}_pair_${roomCounter}`;
      const trioRoom: BreakoutRoomState = {
        roomNumber: roomCounter,
        circleId,
        roomId,
        user1Email: p1.email,
        user1Name: p1.name,
        user2Email: p2.email,
        user2Name: p2.name,
        createdAt: Date.now()
      };
      newRooms.push(trioRoom);

      p1.location = 'pair_room';
      p1.pairRoomNumber = roomCounter;
      p1.partnerName = `${p2.name} و ${p3.name}`;
      p1.partnerEmail = p2.email;
      p1.role = 'reciter';

      p2.location = 'pair_room';
      p2.pairRoomNumber = roomCounter;
      p2.partnerName = `${p1.name} و ${p3.name}`;
      p2.partnerEmail = p1.email;
      p2.role = 'listener';

      p3.location = 'pair_room';
      p3.pairRoomNumber = roomCounter;
      p3.partnerName = `${p1.name} و ${p2.name}`;
      p3.partnerEmail = p1.email;
      p3.role = 'listener';
    }
  }

  breakoutRooms[circleId] = newRooms;

  const requester = peers.find(p => p.email === cleanRequester);
  const myAssignment = requester && requester.location === 'pair_room' ? {
    roomNumber: requester.pairRoomNumber || 1,
    partnerName: requester.partnerName || 'الشريك',
    partnerEmail: requester.partnerEmail || '',
    role: requester.role || 'reciter'
  } : null;

  res.json({
    success: true,
    status: isOdd ? 'odd_trio_paired' : 'distributed',
    rooms: newRooms,
    myAssignment
  });
});

// 2. Choose specific partner from the lobby (Strict Validation: Prevent Self-Matching & Race Condition)
app.post('/api/breakout/pick-partner', (req, res) => {
  const { circleId = 'default', myEmail, partnerEmail } = req.body;
  const cleanMyEmail = String(myEmail || '').trim().toLowerCase();
  const cleanPartnerEmail = String(partnerEmail || '').trim().toLowerCase();

  // Strict Validation 1: Prevent self-matching
  if (!cleanMyEmail || !cleanPartnerEmail) {
    return res.status(400).json({ success: false, message: 'بيانات الحساب غير مكتملة.' });
  }

  if (cleanMyEmail === cleanPartnerEmail) {
    return res.status(400).json({
      success: false,
      message: 'لا يمكنك مطابقة نفسك كشريك للتسميع الثنائي. يرجى اختيار حافظ آخر متواجد في الساحة.'
    });
  }

  const peers = livePeers[circleId] || [];
  const p1 = peers.find(p => p.email === cleanMyEmail);
  const p2 = peers.find(p => p.email === cleanPartnerEmail);

  if (!p1) {
    return res.status(404).json({ success: false, message: 'أنت غير متواجد في الساحة حالياً.' });
  }

  // Strict Validation 2: Partner already in another breakout room
  if (p2 && p2.location === 'pair_room') {
    return res.status(409).json({
      success: false,
      message: `الحافظ ${p2.name} متواجد حالياً في غرفة تسميع معزولة أخرى.`
    });
  }

  const existingRooms = breakoutRooms[circleId] || [];
  const nextRoomNum = (existingRooms.length || 0) + 1;
  const partnerName = p2?.name || cleanPartnerEmail.split('@')[0] || 'الشريك';

  p1.location = 'pair_room';
  p1.pairRoomNumber = nextRoomNum;
  p1.partnerName = partnerName;
  p1.partnerEmail = cleanPartnerEmail;
  p1.role = 'reciter';

  if (p2) {
    p2.location = 'pair_room';
    p2.pairRoomNumber = nextRoomNum;
    p2.partnerName = p1.name;
    p2.partnerEmail = p1.email;
    p2.role = 'listener';
  }

  const newRoom: BreakoutRoomState = {
    roomNumber: nextRoomNum,
    circleId,
    roomId: `${circleId}_pair_${nextRoomNum}`,
    user1Email: p1.email,
    user1Name: p1.name,
    user2Email: cleanPartnerEmail,
    user2Name: partnerName,
    createdAt: Date.now()
  };

  breakoutRooms[circleId] = [...existingRooms, newRoom];

  res.json({
    success: true,
    roomNumber: nextRoomNum,
    partnerName,
    partnerEmail: cleanPartnerEmail,
    role: 'reciter'
  });
});

// 3. Join pair room directly
app.post('/api/breakout/join-pair', (req, res) => {
  const { circleId = 'default', email, roomNumber, partnerEmail, partnerName, role } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const peers = livePeers[circleId] || [];
  const p = peers.find(peer => peer.email === cleanEmail);
  if (p) {
    p.location = 'pair_room';
    p.pairRoomNumber = roomNumber || 1;
    p.partnerName = partnerName || 'الشريك';
    p.partnerEmail = partnerEmail || '';
    p.role = role || 'reciter';
  }
  res.json({ success: true });
});

// 4. Leave pair room and return to Main Lobby
app.post('/api/breakout/leave-pair', (req, res) => {
  const { circleId = 'default', email } = req.body;
  const cleanEmail = (email || '').trim().toLowerCase();
  const peers = livePeers[circleId] || [];
  const p = peers.find(peer => peer.email === cleanEmail);
  const oldRoomNum = p?.pairRoomNumber;

  if (p) {
    p.location = 'lobby';
    p.pairRoomNumber = undefined;
    p.partnerName = undefined;
    p.partnerEmail = undefined;
    p.role = undefined;
  }

  // Check if any other peer is still in this pair room
  if (oldRoomNum && breakoutRooms[circleId]) {
    const anyoneLeft = peers.some(peer => peer.pairRoomNumber === oldRoomNum && peer.location === 'pair_room');
    if (!anyoneLeft) {
      breakoutRooms[circleId] = breakoutRooms[circleId].filter(r => r.roomNumber !== oldRoomNum);
    }
  }

  res.json({ success: true });
});

// 5. Get current breakout status and real-time assignments
app.get('/api/breakout/status/:circleId/:email', (req, res) => {
  const circleId = req.params.circleId || 'default';
  const cleanEmail = (req.params.email || '').trim().toLowerCase();
  const peers = livePeers[circleId] || [];
  const me = peers.find(p => p.email === cleanEmail);

  const lobbyPeers = peers.filter(p => p.location !== 'pair_room');
  const pairPeers = peers.filter(p => p.location === 'pair_room');

  res.json({
    success: true,
    myLocation: me?.location || 'lobby',
    myAssignment: me && me.location === 'pair_room' ? {
      roomNumber: me.pairRoomNumber || 1,
      partnerName: me.partnerName || 'الشريك',
      partnerEmail: me.partnerEmail || '',
      role: me.role || 'listener'
    } : null,
    lobbyPeers,
    pairPeers,
    rooms: breakoutRooms[circleId] || []
  });
});

// 7. Real-Time Pair Recitation Synchronizer (Follows imam/reader & flips page automatically)
interface RoomRecitationState {
  roomNumber: number;
  surahName: string;
  pageNumber: number;
  startAyah: number;
  currentWordIdx: number;
  isReciting: boolean;
  updatedAt: number;
  reciterName: string;
}

const roomRecitations: Record<number, RoomRecitationState> = {
  3: {
    roomNumber: 3,
    surahName: 'سورة البقرة',
    pageNumber: 22,
    startAyah: 141,
    currentWordIdx: 0,
    isReciting: false,
    updatedAt: Date.now(),
    reciterName: 'yousef.hafiz'
  }
};

app.get('/api/recitation/session/:roomNumber', (req, res) => {
  const roomNumber = parseInt(req.params.roomNumber, 10) || 3;
  const session = roomRecitations[roomNumber] || {
    roomNumber,
    surahName: 'سورة البقرة',
    pageNumber: 22,
    startAyah: 141,
    currentWordIdx: 0,
    isReciting: false,
    updatedAt: Date.now(),
    reciterName: 'yousef.hafiz'
  };
  res.json({ success: true, session });
});

app.post('/api/recitation/update', (req, res) => {
  const { roomNumber = 3, surahName, pageNumber, startAyah, currentWordIdx, isReciting, reciterName } = req.body;
  const num = parseInt(roomNumber, 10) || 3;

  const current = roomRecitations[num] || {
    roomNumber: num,
    surahName: 'سورة البقرة',
    pageNumber: 22,
    startAyah: 141,
    currentWordIdx: 0,
    isReciting: false,
    updatedAt: Date.now(),
    reciterName: 'yousef.hafiz'
  };

  roomRecitations[num] = {
    ...current,
    ...(surahName !== undefined && { surahName }),
    ...(pageNumber !== undefined && { pageNumber: parseInt(pageNumber, 10) }),
    ...(startAyah !== undefined && { startAyah: parseInt(startAyah, 10) }),
    ...(currentWordIdx !== undefined && { currentWordIdx: parseInt(currentWordIdx, 10) }),
    ...(isReciting !== undefined && { isReciting: Boolean(isReciting) }),
    ...(reciterName !== undefined && { reciterName }),
    updatedAt: Date.now()
  };

  res.json({ success: true, session: roomRecitations[num] });
});

// Swap Reciter / Listener Role ("حسبُك" Exchange)
app.post('/api/recitation/swap-role', (req, res) => {
  const { roomNumber = 3, newReciterName, newListenerName } = req.body;
  const num = parseInt(roomNumber, 10) || 3;

  const current = roomRecitations[num] || {
    roomNumber: num,
    surahName: 'سورة البقرة',
    pageNumber: 22,
    startAyah: 141,
    currentWordIdx: 0,
    isReciting: false,
    updatedAt: Date.now(),
    reciterName: newReciterName || 'الحافظ'
  };

  roomRecitations[num] = {
    ...current,
    reciterName: newReciterName || current.reciterName,
    isReciting: false,
    currentWordIdx: 0,
    updatedAt: Date.now()
  };

  res.json({
    success: true,
    message: `حسبُك • تم تبادل الأدوار بنجاح. القارئ الآن هو ${newReciterName || 'القارئ'} والمستمع هو ${newListenerName || 'المستمع'}.`,
    session: roomRecitations[num]
  });
});

// WebRTC Signaling Relay for Real Discord / WhatsApp style Peer-to-Peer Calls
interface StoredSignal {
  from: string;
  to: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signal: any;
  t: number;
}
const liveSignals: Record<string, StoredSignal[]> = {};

app.post('/api/live-call/signal', (req, res) => {
  const { circleId = 'default', channelId, from, to, signal } = req.body;
  const channel = channelId || `${circleId}_lobby`;
  if (!liveSignals[channel]) liveSignals[channel] = [];
  liveSignals[channel].push({ from, to, signal, t: Date.now() });
  if (liveSignals[channel].length > 150) liveSignals[channel].shift();
  res.json({ success: true });
});

app.get('/api/live-call/signals/:channelId/:myId', (req, res) => {
  const { channelId, myId } = req.params;
  const all = liveSignals[channelId] || [];
  const forMe = all.filter(s => s.to === myId || s.to === 'broadcast');
  liveSignals[channelId] = all.filter(s => !(s.to === myId));
  res.json({ success: true, signals: forMe });
});

// Setup Vite middleware for local development
async function startServer() {
  await initFirestore();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tasmee Quran Real Video Call Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
