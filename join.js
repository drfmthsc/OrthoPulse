<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Present · OrthoPulse</title>
<link rel="stylesheet" href="/css/app.css" />
<script src="/socket.io/socket.io.js"></script>
<style>
  .stage{flex:1;display:flex;flex-direction:column;padding:20px 24px 24px;max-width:1100px;margin:0 auto;width:100%}
  .stage-head{display:flex;align-items:center;gap:14px;margin-bottom:6px;flex-wrap:wrap}
  .qcount{font-family:var(--f-mono);font-size:12px;letter-spacing:.14em;color:var(--slate)}
  .qtype{font-family:var(--f-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--teal);border:1px solid var(--line);border-radius:100px;padding:3px 10px}
  .qtext{font-family:var(--f-display);font-weight:600;font-size:clamp(24px,4vw,44px);line-height:1.1;letter-spacing:-.02em;margin:6px 0 18px;max-width:26ch}
  .qmedia{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}
  .qmedia img{max-height:320px;max-width:min(46%,460px);border-radius:12px;border:1px solid var(--line-strong)}
  .results{display:flex;flex-direction:column;gap:12px;flex:1;min-width:300px}
  .bar-row{display:flex;flex-direction:column;gap:6px}
  .bar-top{display:flex;align-items:baseline;gap:10px}
  .bar-key{font-family:var(--f-mono);font-size:12px;color:var(--slate);border:1px solid var(--line);border-radius:5px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;flex:none}
  .bar-label{font-size:16px;font-weight:500;flex:1}
  .bar-pct{font-family:var(--f-mono);font-size:15px;color:var(--bone-dim)}
  .bar-track{height:34px;background:var(--xray-panel);border-radius:8px;overflow:hidden;border:1px solid var(--line)}
  .bar-fill{height:100%;width:0;background:linear-gradient(90deg,var(--teal-deep),var(--teal));border-radius:8px;transition:width .6s cubic-bezier(.2,.7,.2,1);display:flex;align-items:center;justify-content:flex-end;padding-right:10px}
  .bar-fill.correct{background:linear-gradient(90deg,#1c8f5f,var(--good))}
  .bar-fill.wrong{background:linear-gradient(90deg,#3a4552,#55616f)}
  .bar-row.is-correct .bar-label::after{content:"✓";color:var(--good);margin-left:8px}
  .cnt{font-family:var(--f-mono);font-size:12px;color:rgba(4,32,29,.8);font-weight:700}
  .empty{color:var(--slate);font-family:var(--f-mono);font-size:13px;padding:16px 0}

  .stage-foot{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--line);flex-wrap:wrap}
  .votes-live{font-family:var(--f-mono);font-size:13px;color:var(--bone-dim);display:flex;align-items:center;gap:8px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--teal);animation:pulse 1.8s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(26,181,164,.5)}70%{box-shadow:0 0 0 10px rgba(26,181,164,0)}100%{box-shadow:0 0 0 0 rgba(26,181,164,0)}}

  .joincard{background:var(--xray-panel);border:1px solid var(--line-strong);border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;box-shadow:var(--shadow);margin-top:16px}
  .plate{font-family:var(--f-mono);font-weight:700;font-size:clamp(30px,5vw,50px);letter-spacing:.12em;color:var(--bone);background:#0a1017;border:1px dashed var(--line-strong);border-radius:10px;padding:8px 20px}
  .jmeta .k{font-family:var(--f-mono);font-size:10px;letter-spacing:.2em;color:var(--teal);text-transform:uppercase}
  .jmeta .v{font-size:14px;color:var(--bone-dim);max-width:32ch;line-height:1.4;margin-top:4px}
  .qr{margin-left:auto;background:#fff;padding:8px;border-radius:10px;line-height:0}
  .qr img{width:120px;height:120px;display:block}

  .lb{display:flex;flex-direction:column;gap:8px}
  .lb .row{display:flex;align-items:center;gap:14px;background:var(--xray-panel);border:1px solid var(--line);border-radius:10px;padding:12px 16px}
  .lb .row.top{border-color:var(--teal)}
  .lb .rk{font-family:var(--f-mono);font-weight:700;color:var(--teal)}
  .lb .nm{flex:1;font-weight:600;font-size:18px}
  .lb .sc{font-family:var(--f-mono);color:var(--bone-dim);font-size:18px}

  .picker{max-width:760px;margin:0 auto;width:100%}
  .bank-row{display:flex;align-items:center;gap:14px;background:var(--xray-panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:12px;transition:.18s}
  .bank-row:hover{border-color:var(--line-strong)}
  .bank-row .bt{flex:1}
  .bank-row h3{font-family:var(--f-display);font-weight:600;font-size:18px;margin:0 0 3px}
  .bank-row .bm{font-family:var(--f-mono);font-size:11px;color:var(--slate)}
  .toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--bone-dim)}
</style>
</head>
<body>
<div class="marker l">L<small>ORTHO</small></div>
<div class="marker r">R<small>PULSE</small></div>
<div class="page">
  <div class="topbar">
    <a class="logo" href="/"><span class="glyph"><svg width="24" height="24" viewBox="0 0 26 26" fill="none"><path d="M7 4c-1.7 0-3 1.3-3 3 0 1.3.8 2.4 2 2.8v6.4c-1.2.4-2 1.5-2 2.8 0 1.7 1.3 3 3 3s3-1.3 3-3c0-1.3-.8-2.4-2-2.8V9.8c1.2-.4 2-1.5 2-2.8 0-1.7-1.3-3-3-3zM19 4c-1.7 0-3 1.3-3 3 0 1.3.8 2.4 2 2.8v6.4c-1.2.4-2 1.5-2 2.8 0 1.7 1.3 3 3 3s3-1.3 3-3c0-1.3-.8-2.4-2-2.8V9.8c1.2-.4 2-1.5 2-2.8 0-1.7-1.3-3-3-3z" stroke="#1ab5a4" stroke-width="1.4"/></svg></span>Ortho<b>Pulse</b></a>
    <div class="spacer"></div>
    <a class="ghostbtn" href="/admin">Banks</a>
    <span class="pill" id="titlepill" style="display:none"></span>
  </div>
  <div id="main"></div>
</div>
<script src="/js/present.js"></script>
</body>
</html>
