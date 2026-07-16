// store.js — tiny atomic JSON persistence for question banks.
// Live session/voting state lives in memory (see server.js); this file only
// stores the author's banks and questions, which is low-volume and safe.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db = { banks: {} };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!db.banks) db.banks = {};
    }
  } catch (e) {
    console.error('Could not read db.json, starting fresh:', e.message);
    db = { banks: {} };
  }
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic on same filesystem
}

function id(n = 8) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

load();

module.exports = {
  DATA_DIR, UPLOAD_DIR,
  listBanks() {
    return Object.values(db.banks).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },
  getBank(bankId) { return db.banks[bankId] || null; },
  createBank(title, description = '') {
    const b = { id: id(), title: title || 'Untitled bank', description, createdAt: Date.now(), questions: [] };
    db.banks[b.id] = b; save(); return b;
  },
  updateBank(bankId, patch) {
    const b = db.banks[bankId]; if (!b) return null;
    Object.assign(b, patch); save(); return b;
  },
  deleteBank(bankId) { delete db.banks[bankId]; save(); },
  addQuestion(bankId, q) {
    const b = db.banks[bankId]; if (!b) return null;
    q.id = id(6); b.questions.push(q); save(); return q;
  },
  updateQuestion(bankId, qId, patch) {
    const b = db.banks[bankId]; if (!b) return null;
    const q = b.questions.find(x => x.id === qId); if (!q) return null;
    Object.assign(q, patch); save(); return q;
  },
  deleteQuestion(bankId, qId) {
    const b = db.banks[bankId]; if (!b) return;
    b.questions = b.questions.filter(x => x.id !== qId); save();
  },
  reorderQuestions(bankId, order) {
    const b = db.banks[bankId]; if (!b) return;
    const map = Object.fromEntries(b.questions.map(q => [q.id, q]));
    b.questions = order.map(qid => map[qid]).filter(Boolean);
    save();
  },
  newId: id
};
