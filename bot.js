// Мгновенный мост Telegram → CRM (Apps Script).
// Держит long-polling соединение с Telegram и передаёт каждое обновление в CRM.
const fs = require('fs');
const path = require('path');

const TOKEN = '8900078850:AAEE2ajHRnd0ufYFONB2Hl3nQG3cQpVXgQk';
const CRM = 'https://script.google.com/macros/s/AKfycbwzkQLLnA4e0YUVomnog_VfgiHkuEJEGtUJ9zW8W8VWpghv2EgmQUmHF67wPumVhHTg/exec';
const LOG = path.join(__dirname, 'tg-bridge.log');

function log(msg) {
  const line = `[${new Date().toLocaleString('ru-RU')}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) { }
}

let offset = 0;
const OFFSET_FILE = path.join(__dirname, 'tg-bridge.offset');
try { offset = Number(fs.readFileSync(OFFSET_FILE, 'utf8')) || 0; } catch (e) { }

async function handle(update) {
  try {
    const r = await fetch(CRM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(180000)
    });
    return r.status;
  } catch (e) {
    return 'ERR ' + e.message.split('\n')[0].slice(0, 60);
  }
}

async function loop() {
  log('мост запущен, ожидаю сообщения');
  for (;;) {
    try {
      const url = `https://api.telegram.org/bot${TOKEN}/getUpdates?timeout=25&offset=${offset}&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D`;
      const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
      const j = await r.json();
      if (!j.ok) { log('getUpdates ошибка: ' + JSON.stringify(j).slice(0, 120)); await new Promise(x => setTimeout(x, 3000)); continue; }
      for (const u of (j.result || [])) {
        const kind = u.callback_query ? 'кнопка ' + u.callback_query.data : (u.message && u.message.text ? 'текст' : (u.message && u.message.photo ? 'фото' : 'другое'));
        const who = (u.message && u.message.from && u.message.from.first_name) || (u.callback_query && u.callback_query.from && u.callback_query.from.first_name) || '?';
        log('→ ' + who + ': ' + kind);
        const code = await handle(u);
        log('← CRM ответил ' + code);
        offset = u.update_id + 1;
        try { fs.writeFileSync(OFFSET_FILE, String(offset)); } catch (e) { }
      }
    } catch (e) {
      log('цикл: ' + e.message.split('\n')[0].slice(0, 80));
      await new Promise(x => setTimeout(x, 2000));
    }
  }
}

loop();
