/* Собирает веб-часть внутрь приложения: копирует public/ в www/ и вшивает
   адрес сервера. Пока в capacitor.config.json есть блок "server" с url —
   приложение грузит живой сайт и этот www не используется. Перед отправкой
   в App Store блок "server" убирается, и приложение работает из www. */
const fs = require('fs'), path = require('path');
const SERVER = process.env.PYRAMID_SERVER || 'https://pyramid-fp70.onrender.com';
const src = path.join(__dirname, '..', 'public'), dst = path.join(__dirname, 'www');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (f.endsWith('.html') && f !== 'index.html') continue;
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
let html = fs.readFileSync(path.join(dst, 'index.html'), 'utf8');
html = html.replace('<head>', '<head>\n<script>window.PYRAMID_SERVER=' + JSON.stringify(SERVER) + ';</script>');
fs.writeFileSync(path.join(dst, 'index.html'), html);
console.log('www собран, сервер:', SERVER);
