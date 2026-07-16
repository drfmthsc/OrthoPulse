<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>OrthoPulse — live orthopedic polling & quizzing</title>
<link rel="stylesheet" href="/css/app.css" />
<style>
  .hero{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:40px 24px 60px}
  .hero h1{font-family:var(--f-display);font-weight:700;font-size:clamp(40px,9vw,84px);line-height:.96;letter-spacing:-.03em;margin:0 0 18px;max-width:13ch}
  .hero h1 em{font-style:normal;color:var(--teal)}
  .hero p{font-size:clamp(15px,2.4vw,18px);color:var(--bone-dim);max-width:48ch;line-height:1.6;margin:0 auto 38px}
  .cta-row{display:flex;gap:16px;flex-wrap:wrap;justify-content:center}
  .goniometer{margin:0 auto 28px}
</style>
</head>
<body>
<div class="marker l">L<small>ORTHO</small></div>
<div class="marker r">R<small>PULSE</small></div>
<div class="page">
  <div class="hero">
    <div class="eyebrow">Live polling &amp; exam quizzing · orthopedics</div>
    <h1>Read the room, <em>not just the film.</em></h1>
    <div class="goniometer">
      <svg width="150" height="60" viewBox="0 0 150 60" fill="none">
        <path d="M10 50 L120 50" stroke="rgba(240,233,219,.25)" stroke-width="1.5"/>
        <path d="M10 50 L108 18" stroke="#1ab5a4" stroke-width="2"/>
        <path d="M40 50 A30 30 0 0 0 34 33" stroke="#e8794a" stroke-width="1.5" fill="none"/>
        <text x="46" y="42" fill="#e8794a" font-family="Space Mono" font-size="11">18°</text>
        <circle cx="10" cy="50" r="3.5" fill="#1ab5a4"/>
      </svg>
    </div>
    <p>Run image-based MCQs, true/false and full exam banks from the podium. Up to hundreds of people join from any phone with a 5-character code — results and the leaderboard update live.</p>
    <div class="cta-row">
      <a class="btn primary" href="/present">Present a session &rarr;</a>
      <a class="btn secondary" href="/join">Join with a code</a>
      <a class="btn secondary" href="/admin">Build question banks</a>
    </div>
  </div>
  <div class="credit">
    Created by <b>Dr Harvinder Singh Chhabra</b> · <a href="mailto:hschhabra@srhu.edu.in">hschhabra@srhu.edu.in</a><br>
    Teaching aid — verify answer keys against current local guidelines.
  </div>
</div>
</body>
</html>
