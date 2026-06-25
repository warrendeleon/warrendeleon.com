// Generates the print-ready CV HTML for each locale from src/data/cv-<locale>.json,
// using the A4 print design from the reference CV. Render to PDF with headless
// Chrome (see scripts/generate-cv-pdfs.sh). Run after the CV copy changes so the
// downloadable PDFs stay in sync with the web CV.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'es', 'ca', 'tl'];

const headshot = readFileSync(join(root, 'public/images/warren-deleon-headshot.jpg')).toString('base64');
const avatar = `data:image/jpeg;base64,${headshot}`;

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Keep inline <strong> from **bold** markers; escape everything else.
const rich = (s = '') =>
  esc(s).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

const labelsFor = (loc) => {
  const cv = JSON.parse(readFileSync(join(root, `src/i18n/${loc}.json`), 'utf8')).cv;
  return {
    profile: cv.profile,
    experience: cv.experience,
    earlierCareer: cv.earlierCareer,
    skills: cv.skills,
    education: cv.education,
    languages: cv.languages,
  };
};

const ICON = {
  mail: '<path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>',
  tel: '<path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>',
  web: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
  check: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>',
  li: '<path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 17v-6.5H6.17V17h2.17zM7.25 9.5a1.26 1.26 0 1 0 0-2.52 1.26 1.26 0 0 0 0 2.52zM18 17v-3.57c0-1.9-1.01-2.78-2.36-2.78-1.09 0-1.58.6-1.85 1.02v-.87h-2.17V17h2.17v-3.5c0-.92.17-1.81 1.31-1.81 1.12 0 1.13 1.05 1.13 1.88V17H18z"/>',
  gh: '<path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02.8-.22 1.65-.33 2.5-.34.85.01 1.7.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/>',
};
const svg = (path) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="#6dc402">${path}</svg>`;

const fullEntry = (j) => `
  <div class="exp-entry">
    <div class="exp-head">
      <div class="company">${esc(j.company)}</div>
      <div class="dates">${esc(j.dates)}</div>
    </div>
    <div class="role">${esc(j.role)}</div>
    <p class="exp-summary">${rich(j.summary)}</p>
    ${j.bullets ? `<ul class="bullets">${j.bullets.map((b) => `<li>${rich(b)}</li>`).join('')}</ul>` : ''}
    ${j.tech ? `<div class="tech">${esc(j.tech)}</div>` : ''}
    ${j.subRole ? `
    <div class="sub-role">
      <div class="exp-head">
        <div class="role">${esc(j.subRole.role)}</div>
        <div class="dates">${esc(j.subRole.dates)}</div>
      </div>
      <p class="exp-summary">${rich(j.subRole.summary)}</p>
      <div class="tech">${esc(j.subRole.tech)}</div>
    </div>` : ''}
  </div>`;

const miniEntry = (j) => `
  <div class="exp-mini">
    <div class="mini-head">
      <div><span class="mini-co">${esc(j.company)}</span> <span class="mini-role">${esc(j.role)}</span></div>
      <div class="dates">${esc(j.dates)}</div>
    </div>
    <p class="mini-sum">${rich(j.summary)}</p>
    <div class="tech">${esc(j.tech)}</div>
  </div>`;

const earlierRow = (j) => `
  <div class="earlier-row"><div class="what"><strong>${esc(j.company)}</strong> — ${esc(j.role)}${j.stack ? ` <span class="stack">· ${esc(j.stack)}</span>` : ''}</div><div class="when">${esc(j.dates)}</div></div>`;

const skillRow = (cat) => `
  <div class="skill-row">
    <div class="skill-label">${esc(cat.label)}</div>
    <div class="chips">${cat.items.map((i) => `<span class="chip${cat.emphasis ? ' dark' : ''}">${esc(i)}</span>`).join('')}</div>
  </div>`;

const eduRow = (e) => `
  <div class="edu-head">
    <div class="edu-title">${esc(e.title)} <span class="sub">· ${esc(e.institution)}</span></div>
    <div class="edu-when">${esc(e.dates)}</div>
  </div>`;

const langRow = (l) => `
  <div class="lang"><span class="lang-name">${esc(l.name)}</span><span class="lang-level${l.muted ? ' muted' : ''}">${esc(l.level)}</span></div>`;

const body = (cv, L) => `
<main class="doc">
  <header class="hero">
    <img src="${avatar}" alt="Warren de Leon" style="float:right; position:relative; z-index:1; width:104px; height:104px; margin:0.1rem 0 1rem 1.6rem; border-radius:50%; object-fit:cover; box-shadow:0 0 0 3px #6dc402, 0 0 0 9px rgba(109,196,2,0.18);">
    <div class="hero-eyebrow">${esc(cv.role)}</div>
    <h1 class="hero-name">Warren <span>de Leon</span></h1>
    <div class="hero-divider"></div>
    <div class="contact" style="clear:right;">
      <a href="mailto:${esc(cv.contact.email)}">${svg(ICON.mail)}${esc(cv.contact.email)}</a>
      <a href="tel:${esc(cv.contact.phone)}">${svg(ICON.tel)}${esc(cv.contact.phone)}</a>
      <a href="https://${esc(cv.contact.website)}">${svg(ICON.web)}https://${esc(cv.contact.website)}</a>
      <span>${svg(ICON.check)}${esc(cv.contact.status)}</span>
      <a href="https://${esc(cv.contact.linkedin)}">${svg(ICON.li)}https://${esc(cv.contact.linkedin)}</a>
      <a href="https://${esc(cv.contact.github)}">${svg(ICON.gh)}https://${esc(cv.contact.github)}</a>
    </div>
  </header>

  <section class="profile">
    <h2 class="section-title">${esc(L.profile)}</h2>
    <div class="rule"></div>
    <p>${rich(cv.profile)}</p>
  </section>

  <section>
    <h2 class="section-title">${esc(L.experience)}</h2>
    <div class="rule"></div>
    ${cv.experience.map(fullEntry).join('')}
    ${cv.experienceCompact.map(miniEntry).join('')}
    <div class="earlier-block">
      <div class="earlier-title">${esc(L.earlierCareer)}</div>
      <div class="earlier-list">${cv.earlier.map(earlierRow).join('')}</div>
    </div>
  </section>

  <section>
    <h2 class="section-title">${esc(L.skills)}</h2>
    <div class="rule"></div>
    <div class="skills-grid">${cv.skills.map(skillRow).join('')}</div>
  </section>

  <section>
    <h2 class="section-title">${esc(L.education)}</h2>
    <div class="rule"></div>
    <div class="edu-list">
      ${cv.education.map(eduRow).join('')}
      <div class="certs">${cv.certs.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    </div>
  </section>

  <section>
    <h2 class="section-title">${esc(L.languages)}</h2>
    <div class="rule"></div>
    <div class="lang-list">${cv.languages.map(langRow).join('')}</div>
  </section>
</main>`;

const CSS = `
  :root { --ink:#0e0c19; --body:#43434a; --muted:#6b6b72; --faint:#8a8a92; --green:#6dc402; --green-dark:#5aa302; --green-light:#8fd640; --line:#ececec; --line-dash:#e3e3e6; --chip-bg:#f3f3f5; --chip-border:#e4e4e6; --chip-text:#333; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin:0; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:var(--ink); -webkit-font-smoothing:antialiased; line-height:1.6; }
  h1,h2,h3 { text-wrap:balance; margin:0; }
  p,li { text-wrap:pretty; }
  a { color:inherit; text-decoration:none; }
  strong { color:var(--ink); font-weight:600; }
  .doc { background:#fff; }
  .hero { position:relative; overflow:hidden; background:var(--ink); border-radius:18px; padding:2.1rem 2.4rem; color:#fff; break-inside:avoid; }
  .hero::before { content:""; position:absolute; top:-80px; right:-50px; width:320px; height:320px; background:radial-gradient(circle, rgba(109,196,2,0.22), transparent 64%); pointer-events:none; }
  .hero-eyebrow { font-size:0.72rem; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--green); }
  .hero-name { font-size:3rem; font-weight:800; line-height:1.04; letter-spacing:-0.03em; margin:0.5rem 0 0; }
  .hero-name span { color:var(--green-light); }
  .hero-divider { height:1px; background:rgba(255,255,255,0.12); margin:1.3rem 0 1.05rem; }
  .contact { display:grid; grid-auto-flow:column; grid-template-rows:repeat(3,auto); grid-template-columns:1fr 1fr; gap:0.62rem 2rem; font-size:0.8rem; color:#d7d7dd; }
  .contact a, .contact span { display:flex; align-items:center; gap:0.45rem; }
  .contact svg { flex:none; }
  section { margin-top:1.35rem; }
  .section-title { font-size:1.4rem; font-weight:700; letter-spacing:-0.02em; }
  .rule { width:60px; height:3px; background:var(--green); border-radius:2px; margin:0.5rem 0 0.85rem; }
  .profile p { margin:0; font-size:0.95rem; line-height:1.65; color:var(--body); max-width:47rem; }
  .skills-grid { display:flex; flex-direction:column; gap:0.75rem; }
  .skill-row { display:grid; grid-template-columns:124px 1fr; gap:0.7rem; align-items:start; break-inside:avoid; }
  .skill-label { font-size:0.78rem; font-weight:600; color:var(--muted); padding-top:0.35rem; }
  .chips { display:flex; flex-wrap:wrap; gap:0.34rem; }
  .chip { padding:0.26rem 0.6rem; border-radius:6px; font-size:0.7rem; font-weight:500; background:var(--chip-bg); color:var(--chip-text); border:1px solid var(--chip-border); }
  .chip.dark { background:var(--ink); color:#fff; border-color:var(--ink); }
  .exp-entry { break-inside:avoid; padding-bottom:0.95rem; margin-bottom:0.95rem; border-bottom:1px solid var(--line); }
  .exp-head { break-after:avoid; display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
  .role { break-after:avoid; font-size:0.9rem; font-weight:600; color:var(--green-dark); margin-top:0.15rem; }
  .exp-entry:last-child { border-bottom:none; margin-bottom:0; padding-bottom:0; }
  .company { font-size:1.06rem; font-weight:700; color:var(--ink); }
  .dates { font-size:0.78rem; color:var(--faint); white-space:nowrap; font-variant-numeric:tabular-nums; }
  .exp-summary { margin:0.55rem 0 0; font-size:0.88rem; line-height:1.6; color:var(--body); }
  .bullets { list-style:none; margin:0.7rem 0 0; padding:0; display:flex; flex-direction:column; gap:0.35rem; }
  .bullets li { position:relative; padding-left:1.05rem; font-size:0.86rem; line-height:1.55; color:var(--body); }
  .bullets li::before { content:""; position:absolute; left:0; top:0.5em; width:6px; height:6px; background:var(--green); border-radius:1px; }
  .tech { margin-top:0.7rem; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:0.72rem; color:var(--muted); letter-spacing:0.01em; }
  .sub-role { margin-top:0.95rem; padding-top:0.85rem; border-top:1px dashed var(--line-dash); }
  .exp-mini { break-inside:avoid; padding-bottom:0.6rem; margin-bottom:0.6rem; border-bottom:1px solid var(--line); }
  .mini-head { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
  .mini-co { font-size:0.98rem; font-weight:700; color:var(--ink); }
  .mini-role { font-size:0.88rem; font-weight:600; color:var(--green-dark); }
  .mini-sum { margin:0.3rem 0 0; font-size:0.85rem; line-height:1.5; color:var(--body); }
  .earlier-block { margin-top:0.3rem; }
  .earlier-title { font-size:0.82rem; font-weight:700; color:var(--ink); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:0.9rem; break-after:avoid; }
  .earlier-list { display:flex; flex-direction:column; gap:0.4rem; }
  .earlier-row { display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:baseline; break-inside:avoid; }
  .earlier-row .what { font-size:0.86rem; color:var(--body); }
  .earlier-row .stack { color:var(--muted); }
  .earlier-row .when { font-size:0.76rem; color:var(--faint); white-space:nowrap; font-variant-numeric:tabular-nums; }
  .edu-list { display:flex; flex-direction:column; gap:0.7rem; }
  .edu-head { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
  .edu-title { font-size:0.92rem; font-weight:600; color:var(--ink); }
  .edu-title .sub { font-weight:500; color:var(--muted); }
  .edu-when { font-size:0.76rem; color:var(--faint); white-space:nowrap; font-variant-numeric:tabular-nums; }
  .certs { display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.2rem; }
  .certs .chip { font-size:0.68rem; }
  .lang-list { display:flex; flex-wrap:wrap; gap:1.6rem; }
  .lang { display:flex; align-items:baseline; gap:0.5rem; }
  .lang-name { font-size:0.92rem; font-weight:600; color:var(--ink); }
  .lang-level { font-size:0.78rem; color:var(--green); font-weight:600; }
  .lang-level.muted { color:var(--muted); }
  @page { size:A4; margin:13mm 16mm 9mm; }
  body { background:#fff; }
  h2 { break-after:avoid; }
  p,li { orphans:3; widows:3; }
`;

const page = (cv, L, lang) => `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>Warren de Leon — CV</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>${body(cv, L)}</body>
</html>`;

for (const loc of LOCALES) {
  const cv = JSON.parse(readFileSync(join(root, `src/data/cv-${loc}.json`), 'utf8'));
  const html = page(cv, labelsFor(loc), loc);
  const out = join(root, `.cv-pdf-build/cv-${loc}.html`);
  writeFileSync(out, html);
  console.log('wrote', out);
}
