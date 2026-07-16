// ============================================================
//  OrthoPulse — live audience polling + exam quizzing
//  Created by Dr Harvinder Singh Chhabra (hschhabra@srhu.edu.in)
// ============================================================
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { Server } = require('socket.io');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
if (ADMIN_PASSWORD === 'changeme') {
  console.warn('\n[!] ADMIN_PASSWORD is not set — using "changeme". Set it in Railway → Variables before your event.\n');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ---------- auth (single shared host/author password) ----------
const tokens = new Set();
function issueToken() { const t = store.newId(24); tokens.add(t); return t; }
function isAuthed(req) { return req.cookies && tokens.has(req.cookies.op_token); }
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.accepts('html') && !req.path.startsWith('/api/')) return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  return res.status(401).json({ error: 'Not signed in.' });
}

app.post('/api/login', (req, res) => {
  if ((req.body.password || '') === ADMIN_PASSWORD) {
    const t = issueToken();
    res.cookie('op_token', t, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 });
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Wrong password.' });
});
app.post('/api/logout', (req, res) => { if (req.cookies) tokens.delete(req.cookies.op_token); res.clearCookie('op_token'); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

// ---------- image upload ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (r, f, cb) => cb(null, store.UPLOAD_DIR),
    filename: (r, f, cb) => cb(null, store.newId(10) + path.extname(f.originalname || '.png').toLowerCase())
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (r, f, cb) => cb(null, /image\/(png|jpe?g|gif|webp)/.test(f.mimetype))
});

app.post('/api/admin/upload-image', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Not an image.' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ---------- bank / question REST API ----------
app.get('/api/admin/banks', requireAuth, (req, res) => res.json(store.listBanks()));
app.get('/api/admin/banks/:id', requireAuth, (req, res) => {
  const b = store.getBank(req.params.id); if (!b) return res.status(404).json({ error: 'No such bank.' }); res.json(b);
});
app.post('/api/admin/banks', requireAuth, (req, res) => res.json(store.createBank(req.body.title, req.body.description)));
app.put('/api/admin/banks/:id', requireAuth, (req, res) => res.json(store.updateBank(req.params.id, { title: req.body.title, description: req.body.description })));
app.delete('/api/admin/banks/:id', requireAuth, (req, res) => { store.deleteBank(req.params.id); res.json({ ok: true }); });

function cleanQuestion(body) {
  const type = body.type === 'truefalse' ? 'truefalse' : 'mcq';
  let options;
  if (type === 'truefalse') {
    options = [{ text: 'True' }, { text: 'False' }];
  } else {
    options = (body.options || []).map(o => ({ text: String(o.text || '').trim() })).filter(o => o.text).slice(0, 6);
  }
  let correct = Array.isArray(body.correct) ? body.correct.map(Number) : [Number(body.correct)];
  correct = correct.filter(i => Number.isInteger(i) && i >= 0 && i < options.length);
  return {
    type,
    text: String(body.text || '').trim(),
    imageUrl: body.imageUrl || null,
    options,
    correct,
    explanation: String(body.explanation || '').trim(),
    timeLimit: body.timeLimit ? Math.max(5, Math.min(300, Number(body.timeLimit))) : null
  };
}

app.post('/api/admin/banks/:id/questions', requireAuth, (req, res) => {
  const q = cleanQuestion(req.body);
  if (!q.text && !q.imageUrl) return res.status(400).json({ error: 'Add question text or an image.' });
  if (q.options.length < 2) return res.status(400).json({ error: 'Need at least two options.' });
  res.json(store.addQuestion(req.params.id, q));
});
app.put('/api/admin/banks/:id/questions/:qid', requireAuth, (req, res) => {
  res.json(store.updateQuestion(req.params.id, req.params.qid, cleanQuestion(req.body)));
});
app.delete('/api/admin/banks/:id/questions/:qid', requireAuth, (req, res) => { store.deleteQuestion(req.params.id, req.params.qid); res.json({ ok: true }); });
app.post('/api/admin/banks/:id/reorder', requireAuth, (req, res) => { store.reorderQuestions(req.params.id, req.body.order || []); res.json({ ok: true }); });

// ---------- bulk import (CSV / XLSX) ----------
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/api/admin/banks/:id/import', requireAuth, memUpload.single('file'), (req, res) => {
  const bank = store.getBank(req.params.id);
  if (!bank) return res.status(404).json({ error: 'No such bank.' });
  if (!req.file) return res.status(400).json({ error: 'No file.' });
  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (e) { return res.status(400).json({ error: 'Could not read that file. Use the sample CSV as a template.' }); }

  const norm = k => String(k).trim().toLowerCase().replace(/[\s_]+/g, '');
  let added = 0; const errors = [];
  rows.forEach((raw, i) => {
    const row = {}; for (const k in raw) row[norm(k)] = raw[k];
    const type = /true|false|tf/i.test(String(row.type)) ? 'truefalse' : 'mcq';
    const text = String(row.question || row.text || '').trim();
    if (!text && !row.image) { return; } // skip blank rows
    let options, correct = [];
    if (type === 'truefalse') {
      options = [{ text: 'True' }, { text: 'False' }];
      correct = [/^t|^true|^1|^yes/i.test(String(row.correct).trim()) ? 0 : 1];
    } else {
      const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
      options = letters.map(l => ({ text: String(row['option' + l] || row['choice' + l] || '').trim() })).filter(o => o.text);
      const raws = String(row.correct || '').split(/[,\s]+/).filter(Boolean);
      correct = raws.map(c => {
        const up = c.trim().toUpperCase();
        if (/^[A-F]$/.test(up)) return up.charCodeAt(0) - 65;         // letter
        const n = parseInt(up, 10); if (!isNaN(n)) return n - 1;      // 1-based number
        return options.findIndex(o => o.text.toLowerCase() === c.trim().toLowerCase()); // full text
      }).filter(x => x >= 0 && x < options.length);
    }
    if (options.length < 2) { errors.push('Row ' + (i + 2) + ': need 2+ options'); return; }
    if (!correct.length) { errors.push('Row ' + (i + 2) + ': no valid correct answer'); return; }
    store.addQuestion(bank.id, {
      type, text, imageUrl: row.image ? String(row.image).trim() : null,
      options, correct, explanation: String(row.explanation || row.explain || '').trim(),
      timeLimit: row.timelimit ? Number(row.timelimit) : null
    });
    added++;
  });
  res.json({ added, errors });
});

// sample template
app.get('/api/sample.csv', (req, res) => {
  const csv = [
    'type,question,option_a,option_b,option_c,option_d,correct,explanation',
    'mcq,Most common Salter-Harris fracture type?,Type I,Type II,Type III,Type IV,B,Type II accounts for ~75% of physeal injuries.',
    'mcq,Garden classification grades which fracture?,Femoral neck,Ankle,Distal radius,Intertrochanteric,A,Garden I-IV grades femoral neck displacement.',
    'truefalse,A Weber C ankle fracture is proximal to the syndesmosis.,,,,,True,Weber C implies syndesmotic disruption.',
    'truefalse,The Lachman test assesses the PCL.,,,,,False,Lachman is the most sensitive test for the ACL.'
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="orthopulse-sample.csv"');
  res.send(csv);
});

// ---------- QR for the join link ----------
app.get('/api/qr', async (req, res) => {
  try {
    const url = String(req.query.text || '');
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0d1620', light: '#ffffff' } });
    res.json({ dataUrl });
  } catch (e) { res.status(400).json({ error: 'bad' }); }
});

// ============================================================
//  LIVE SESSIONS (in-memory) + real-time voting
// ============================================================
const sessions = new Map(); // code -> session

function makeCode() { let c; do { c = store.newId(5).toUpperCase(); } while (sessions.has(c)); return c; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// presenter creates a live session from a bank
app.post('/api/sessions', requireAuth, (req, res) => {
  const bank = store.getBank(req.body.bankId);
  if (!bank || !bank.questions.length) return res.status(400).json({ error: 'Pick a bank that has questions.' });
  const code = makeCode();
  let qs = JSON.parse(JSON.stringify(bank.questions)); // snapshot
  if (req.body.random) shuffle(qs);
  const timerSeconds = Math.max(5, Math.min(300, Number(req.body.timerSeconds) || 30));
  sessions.set(code, {
    code, bankId: bank.id, title: bank.title,
    questions: qs,
    activeIndex: 0, revealed: false, state: 'lobby',
    scoringOn: !!req.body.scoringOn,
    random: !!req.body.random,
    timerSeconds,
    participants: new Map(), // clientId -> {name, score, answers:{qid:{choice,correct}}}
    votes: {},               // qid -> Map(clientId -> choiceIndex)
    questionStartAt: 0
  });
  res.json({ code, scoringOn: !!req.body.scoringOn, timerSeconds });
});

function publicQuestion(s) {
  const q = s.questions[s.activeIndex];
  return {
    id: q.id, index: s.activeIndex, total: s.questions.length,
    type: q.type, text: q.text, imageUrl: q.imageUrl,
    options: q.options.map(o => ({ text: o.text })),
    timeLimit: q.timeLimit || s.timerSeconds, scoringOn: s.scoringOn
  };
}
function tallyFor(s) {
  const q = s.questions[s.activeIndex];
  const counts = q.options.map(() => 0);
  const m = s.votes[q.id];
  let total = 0;
  if (m) for (const idx of m.values()) { if (counts[idx] != null) { counts[idx]++; total++; } }
  return { counts, total, correct: q.correct };
}
function leaderboard(s) {
  return [...s.participants.values()]
    .map(p => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score).slice(0, 12);
}
function scoreFor(limitSeconds, correct, elapsedMs) {
  if (!correct) return 0;
  if (!limitSeconds) return 1000;
  const frac = Math.min(1, elapsedMs / (limitSeconds * 1000));
  return Math.round(1000 * (1 - frac / 2)); // 1000 fast → 500 at the buzzer
}

io.on('connection', (socket) => {
  let role = null, code = null, clientId = null;

  // ---- presenter joins to drive + watch ----
  socket.on('host', ({ code: c }, ack) => {
    const s = sessions.get(c);
    if (!s) return ack && ack({ error: 'Session not found. Start it again from the dashboard.' });
    role = 'host'; code = c; socket.join('host:' + c);
    ack && ack({ ok: true, title: s.title, scoringOn: s.scoringOn, state: s.state, ...stateForHost(s) });
  });

  function stateForHost(s) {
    return {
      state: s.state, timerSeconds: s.timerSeconds,
      question: publicQuestion(s), revealed: s.revealed,
      tally: tallyFor(s), participants: s.participants.size,
      leaderboard: s.scoringOn ? leaderboard(s) : []
    };
  }
  function broadcastHost(s) { io.to('host:' + s.code).emit('host-state', stateForHost(s)); }
  // throttle the high-frequency (answer-driven) updates so a burst of 150 votes
  // doesn't flood the presenter; state changes still broadcast immediately.
  function broadcastHostThrottled(s) {
    const now = Date.now();
    if (!s._lastCast) s._lastCast = 0;
    if (now - s._lastCast >= 350) { s._lastCast = now; broadcastHost(s); }
    else if (!s._castPending) {
      s._castPending = setTimeout(() => { s._castPending = null; s._lastCast = Date.now(); broadcastHost(s); }, 350);
    }
  }
  function pushQuestion(s) {
    s.revealed = false; s.questionStartAt = Date.now();
    io.to('play:' + s.code).emit('question', publicQuestion(s));
    broadcastHost(s);
  }

  socket.on('present:next', () => { const s = sessions.get(code); if (!s || role !== 'host') return; if (s.activeIndex < s.questions.length - 1) { s.activeIndex++; s.state = 'live'; pushQuestion(s); } });
  socket.on('present:prev', () => { const s = sessions.get(code); if (!s || role !== 'host') return; if (s.activeIndex > 0) { s.activeIndex--; s.state = 'live'; pushQuestion(s); } });
  socket.on('present:start', () => { const s = sessions.get(code); if (!s || role !== 'host') return; s.state = 'live'; pushQuestion(s); });
  socket.on('present:setTimer', ({ seconds }) => {
    const s = sessions.get(code); if (!s || role !== 'host') return;
    s.timerSeconds = Math.max(5, Math.min(300, Number(seconds) || s.timerSeconds));
    // if we're mid-question and not yet revealed, restart the countdown so it takes effect now
    if (s.state === 'live' && !s.revealed) { s.questionStartAt = Date.now(); io.to('play:' + s.code).emit('question', publicQuestion(s)); }
    broadcastHost(s);
  });
  socket.on('present:reveal', () => {
    const s = sessions.get(code); if (!s || role !== 'host') return;
    s.revealed = true;
    const q = s.questions[s.activeIndex];
    io.to('play:' + s.code).emit('reveal', { correct: q.correct, explanation: q.explanation, tally: tallyFor(s) });
    broadcastHost(s);
  });
  socket.on('present:reset', () => {
    const s = sessions.get(code); if (!s || role !== 'host') return;
    const q = s.questions[s.activeIndex]; s.votes[q.id] = new Map();
    for (const p of s.participants.values()) {
      const a = p.answers[q.id];
      if (a && s.scoringOn) p.score = Math.max(0, p.score - (a.points || 0));
      delete p.answers[q.id];
    }
    s.revealed = false; io.to('play:' + s.code).emit('question', publicQuestion(s)); broadcastHost(s);
  });
  socket.on('present:leaderboard', () => { const s = sessions.get(code); if (!s || role !== 'host') return; io.to('play:' + s.code).emit('leaderboard', leaderboard(s)); broadcastHost(s); });
  socket.on('present:end', () => {
    const s = sessions.get(code); if (!s || role !== 'host') return;
    s.state = 'ended';
    io.to('play:' + s.code).emit('ended', { leaderboard: s.scoringOn ? leaderboard(s) : [] });
    broadcastHost(s);
  });

  // ---- participant joins ----
  socket.on('join', ({ code: c, name, clientId: cid }, ack) => {
    const s = sessions.get((c || '').toUpperCase());
    if (!s) return ack && ack({ error: 'No live session with that code.' });
    if (s.state === 'ended') return ack && ack({ error: 'That session has ended.' });
    role = 'play'; code = s.code; clientId = cid || store.newId(8);
    socket.join('play:' + s.code);
    if (!s.participants.has(clientId)) s.participants.set(clientId, { name: (name || 'Guest').slice(0, 24), score: 0, answers: {} });
    else if (name) s.participants.get(clientId).name = name.slice(0, 24);
    broadcastHost(s);
    ack && ack({
      ok: true, clientId, title: s.title, scoringOn: s.scoringOn, state: s.state,
      question: s.state === 'lobby' ? null : publicQuestion(s),
      alreadyAnswered: !!(s.votes[currentQid(s)] && s.votes[currentQid(s)].has(clientId)),
      revealed: s.revealed
    });
  });
  function currentQid(s) { return s.questions[s.activeIndex] && s.questions[s.activeIndex].id; }

  // ---- participant answers ----
  socket.on('answer', ({ choice }, ack) => {
    const s = sessions.get(code); if (!s || role !== 'play') return;
    const q = s.questions[s.activeIndex];
    if (s.revealed) return ack && ack({ error: 'Answers are closed for this one.' });
    if (!s.votes[q.id]) s.votes[q.id] = new Map();
    if (s.votes[q.id].has(clientId)) return ack && ack({ error: 'You already answered.' });
    const idx = Number(choice);
    if (!(idx >= 0 && idx < q.options.length)) return ack && ack({ error: 'Invalid choice.' });
    s.votes[q.id].set(clientId, idx);
    const p = s.participants.get(clientId);
    const correct = q.correct.includes(idx);
    const pts = s.scoringOn ? scoreFor(q.timeLimit || s.timerSeconds, correct, Date.now() - s.questionStartAt) : 0;
    if (p) { p.answers[q.id] = { choice: idx, correct, points: pts }; p.score += pts; }
    broadcastHostThrottled(s);
    ack && ack({ ok: true, received: true });
  });

  socket.on('disconnect', () => {
    // participants keyed by clientId persist their score; nothing to clean for hosts
  });
});

// ---------- health check (works even if page files are missing) ----------
const PUBLIC_DIR = __dirname;
app.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    indexFound: fs.existsSync(path.join(PUBLIC_DIR, 'index.html')),
    dataDir: store.DATA_DIR,
    time: new Date().toISOString()
  });
});

// ---------- static & pages (flat layout: all files at project root) ----------
app.use('/uploads', express.static(store.UPLOAD_DIR, { maxAge: '1h' }));
app.use(express.static(PUBLIC_DIR, { extensions: false, index: false }));

function sendPage(res, file) {
  const p = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(p)) {
    return res.status(500).type('html').send(
      '<h1>OrthoPulse is running, but a page file is missing.</h1>' +
      '<p>The server started, but <code>' + file + '</code> was not found. ' +
      'Re-upload it to your repository and redeploy.</p>' +
      '<p>Diagnostic: <a href="/healthz">/healthz</a></p>'
    );
  }
  res.sendFile(p);
}

app.get('/', (req, res) => sendPage(res, 'index.html'));
app.get('/join', (req, res) => sendPage(res, 'join.html'));
app.get('/login', (req, res) => sendPage(res, 'login.html'));
app.get('/present', requireAuth, (req, res) => sendPage(res, 'present.html'));
app.get('/admin', requireAuth, (req, res) => sendPage(res, 'admin.html'));

server.listen(PORT, '0.0.0.0', () => console.log('OrthoPulse running on port ' + PORT));
