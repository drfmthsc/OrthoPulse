# OrthoPulse

Live audience polling and exam quizzing for orthopedic teaching — image-based questions, MCQs, true/false, exam banks, bulk upload, and a live leaderboard. Built to run a conference podium with a large audience joining from their phones.

**Created by Dr Harvinder Singh Chhabra** · hschhabra@srhu.edu.in

---

## What it does

- **Present** from the podium: pick a bank, show a 5-character join code + QR, drive questions, reveal answers, show a live leaderboard.
- **Participants** join from any phone browser — no app, no login. Just the code.
- **Author dashboard**: build banks of MCQ / true-false / image questions, add an image to any question, bulk-upload from CSV or Excel, and edit answer keys + explanations.
- **Exam mode**: scores answers (with an optional per-question speed bonus) and ranks a leaderboard, Kahoot-style. Turn it off for anonymous audience polling.

Real-time voting runs over WebSockets, so a room of 150+ updates instantly on one Railway instance.

---

## Deploy on Railway (about 5 minutes)

1. **Get the code onto GitHub.** Create a new repo and push this folder to it (or upload the files through GitHub's web UI).
2. In [Railway](https://railway.app): **New Project → Deploy from GitHub repo**, and pick your repo. Railway auto-detects Node and runs `npm start`.
3. Open the service → **Variables** tab and add:
   - `ADMIN_PASSWORD` — a strong password. This gates the Present and Banks pages (participants never need it).
   - `DATA_DIR` — set to `/data`.
4. **Add a Volume so your banks and images survive redeploys.** Service → **Settings → Volumes → New Volume**, mount path `/data`. *(Skip this and you can still run an event, but anything you upload is lost on the next deploy.)*
5. Service → **Settings → Networking → Generate Domain**. That public URL is your app.

That's it. Visit the URL, click **Build question banks**, sign in with your `ADMIN_PASSWORD`, and start adding questions.

> Railway gives you a `PORT` automatically — the app reads it. Don't set `PORT` yourself.

### Run it locally first (optional)
```bash
npm install
ADMIN_PASSWORD=test DATA_DIR=./data npm start
# open http://localhost:3000
```

---

## Running a session

1. **Build a bank** under *Banks* — add questions or bulk-upload (see format below).
2. Click **Present** (top of the dashboard, or the Present button on a bank). Choose the bank, leave **Exam mode** on for scoring or turn it off for a plain poll, and hit **Present**.
3. The podium screen shows the **join code and QR**. The audience opens the URL, taps **Join with a code**, enters a name (optional) and the code.
4. Hit **Start**, then **Next** to move through questions. **Reveal answer** shows the correct option + explanation on every phone. **Leaderboard** puts the standings on the big screen.

---

## Bulk upload format (CSV or Excel)

Download the template from the dashboard (**Download sample CSV**). Columns:

| column | meaning |
|---|---|
| `type` | `mcq` or `truefalse` |
| `question` | the question text |
| `option_a` … `option_f` | choices (MCQ only; leave blank for true/false) |
| `correct` | MCQ: the letter (`B`) or number (`2`); true/false: `True` / `False` |
| `explanation` | optional, shown after reveal |
| `image` | optional image URL |

Rows with blank questions are skipped. For **image questions in bulk**, upload the images first through a question in the editor (or host them anywhere) and put the URL in the `image` column — otherwise add images per-question in the editor.

---

## Notes

- Content is a teaching aid. Verify answer keys against current local guidelines — every question is editable.
- Live session state (who's in the room, current votes) is kept in memory for speed and is cleared when the server restarts. Your **question banks and images are persisted** to `DATA_DIR`.
- One Railway instance handles a conference-sized room comfortably. Don't scale to multiple replicas — live sessions live in a single process.

## License
MIT
