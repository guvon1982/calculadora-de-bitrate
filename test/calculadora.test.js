// Testes da calculadora: carregam o index.html REAL num navegador simulado (jsdom),
// digitam nos campos como um usuário e conferem o que aparece na tela.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let dom;
let doc;
let copied;

beforeEach(() => {
  copied = [];
  dom = new JSDOM(html, {
    runScripts: 'dangerously',
    // Antes do script da página rodar, troca a área de transferência por uma falsa
    // para o teste conseguir ver o que seria copiado.
    beforeParse(window) {
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: async (text) => { copied.push(text); } },
      });
    },
  });
  doc = dom.window.document;
});

afterEach(() => dom.window.close());

// Simula o usuário digitando num campo (dispara o evento "input", como no navegador)
function type(id, value) {
  const el = doc.getElementById(id);
  el.value = value;
  el.dispatchEvent(new dom.window.Event('input'));
}

function fill({ h = '', m = '', s = '', size = '', unit = 'MB', audio = '128' }) {
  type('hours', h);
  type('minutes', m);
  type('seconds', s);
  type('sizeUnit', unit);
  type('audio', audio);
  type('size', size);
}

// --- Modelo do que o HandBrake realmente grava, calibrado com um encode real ---
// Log do HandBrake 1.10.2 (x264 multi-pass, MP4), vídeo de 1h19m23s:
//   vídeo 215 kbps → 127.985.993 bytes | áudio AAC 160 kbps → 95.277.270 bytes
//   arquivo final no disco: 226.671.642 bytes
// Conclusões: 1 kbps do HandBrake = 1000 bits/s, e o MP4 acrescenta ~1,53% de envelope.
const REAL_ENCODE = { seconds: 4763.13, videoKbps: 215, audioKbps: 160, fileBytes: 226671642 };
const MP4_OVERHEAD = (226671642 - (127985993 + 95277270)) / (127985993 + 95277270);

function handbrakeFileBytes(videoKbps, audioKbps, seconds) {
  const streamBytes = ((videoKbps + audioKbps) * 1000 / 8) * seconds;
  return streamBytes * (1 + MP4_OVERHEAD);
}

// "MB" como o Windows mostra no Explorador (1 MB = 1024 × 1024 bytes)
const WINDOWS_MB = 1024 * 1024;

const result = () => doc.getElementById('result').textContent;
const warningVisible = () => doc.getElementById('warning').classList.contains('show');
const copyButton = () => doc.getElementById('copy');

test('tela inicial: campos padrão e resultado vazio', () => {
  assert.equal(doc.getElementById('sizeUnit').value, 'MB');
  assert.equal(result(), '—');
  assert.equal(warningVisible(), false);
  // botão com type="button" (não envia formulário) e desativado até haver resultado
  assert.equal(copyButton().getAttribute('type'), 'button');
  assert.equal(copyButton().disabled, true);
});

// Fórmula: MB × 1024 × 1024 bytes × 8 bits × 0,98 (reserva do container) ÷ 1000 ÷ segundos
// = MB × 8220,8358 ÷ segundos  →  kbps total; menos o áudio; arredonda para baixo
test('700 MB em 1h30 com áudio 128 → 937 kbps', () => {
  // 700 × 8220,8358 / 5400 s = 1065,66 kbps total − 128 = 937,66 → 937
  fill({ h: '1', m: '30', s: '0', size: '700' });
  assert.equal(result(), '937');
  assert.equal(copyButton().disabled, false);
  assert.equal(warningVisible(), false);
});

test('converte GB para MB (1 GB = 1024 MB)', () => {
  // 2048 × 8220,8358 / 5400 = 3117,83 − 128 = 2989,83 → 2989
  fill({ h: '1', m: '30', size: '2', unit: 'GB' });
  assert.equal(result(), '2989');
});

test('soma horas, minutos e segundos', () => {
  // 1h 1m 1s = 3661 s; 500 × 8220,8358 / 3661 = 1122,76 − 128 = 994,76 → 994
  fill({ h: '1', m: '1', s: '1', size: '500' });
  assert.equal(result(), '994');
});

test('respeita bitrate de áudio alterado', () => {
  // mesmo caso de 937, mas áudio 192 → 1065,66 − 192 = 873,66 → 873
  fill({ h: '1', m: '30', size: '700', audio: '192' });
  assert.equal(result(), '873');
});

test('atualiza em tempo real a cada digitação', () => {
  fill({ h: '1', m: '30', size: '700' });
  assert.equal(result(), '937');
  type('size', '1400');
  // 1400 × 8220,8358 / 5400 = 2131,33 − 128 = 2003,33 → 2003
  assert.equal(result(), '2003');
});

test('tamanho pequeno demais mostra aviso e bloqueia cópia', () => {
  fill({ h: '1', m: '30', size: '10' });
  assert.equal(result(), '—');
  assert.equal(warningVisible(), true);
  assert.equal(copyButton().disabled, true);
});

test('sobra de menos de 1 kbps para o vídeo também é aviso', () => {
  // 1 MB em 64 s = 8220,8358 / 64 = 128,45 kbps total − 128 = 0,45 → arredondaria para 0
  fill({ m: '1', s: '4', size: '1' });
  assert.equal(warningVisible(), true);
  assert.equal(result(), '—');
});

test('campos vazios ou duração zero não calculam', () => {
  fill({ size: '700' });
  assert.equal(result(), '—');
  assert.equal(warningVisible(), false);
  fill({ h: '1' });
  assert.equal(result(), '—');
});

test('valores negativos são tratados como zero', () => {
  fill({ h: '1', m: '30', size: '700', audio: '-500' });
  // áudio negativo vira 0 → 1065,66 → 1065
  assert.equal(result(), '1065');
});

test('modelo do HandBrake reproduz o arquivo real com erro < 0,1%', () => {
  const predicted = handbrakeFileBytes(REAL_ENCODE.videoKbps, REAL_ENCODE.audioKbps, REAL_ENCODE.seconds);
  const error = Math.abs(predicted - REAL_ENCODE.fileBytes) / REAL_ENCODE.fileBytes;
  assert.ok(error < 0.001, `erro do modelo: ${(error * 100).toFixed(3)}%`);
});

// Regressão: o usuário pediu 200 MB para 1h19m23s, deixou o áudio no padrão
// e o HandBrake (preset Fast 1080p30, áudio 160) gerou 216 MB.
test('caso real: 200 MB em 1h19m23s com áudio padrão não passa de 200 MB', () => {
  fill({ h: '1', m: '19', s: '23', size: '200', audio: doc.getElementById('audio').value });
  const videoKbps = Number(result());
  const fileMb = handbrakeFileBytes(videoKbps, 160, 4763) / WINDOWS_MB;
  assert.ok(fileMb <= 200, `arquivo previsto: ${fileMb.toFixed(1)} MB`);
  // e também não desperdiça: fica a menos de 2% abaixo do alvo
  assert.ok(fileMb >= 196, `arquivo previsto: ${fileMb.toFixed(1)} MB`);
});

test('áudio padrão é 160 kbps, igual aos presets do HandBrake', () => {
  assert.equal(doc.getElementById('audio').value, '160');
});

test('vários tamanhos e durações ficam entre 98% e 100% do alvo', () => {
  const cases = [
    { h: '0', m: '10', s: '0', size: '50', unit: 'MB', audio: '160' },
    { h: '1', m: '30', s: '0', size: '700', unit: 'MB', audio: '128' },
    { h: '2', m: '0', s: '0', size: '2', unit: 'GB', audio: '160' },
    { h: '0', m: '45', s: '30', size: '300', unit: 'MB', audio: '256' },
  ];
  for (const c of cases) {
    fill(c);
    const seconds = Number(c.h) * 3600 + Number(c.m) * 60 + Number(c.s);
    const targetBytes = Number(c.size) * WINDOWS_MB * (c.unit === 'GB' ? 1024 : 1);
    const ratio = handbrakeFileBytes(Number(result()), Number(c.audio), seconds) / targetBytes;
    assert.ok(ratio <= 1 && ratio >= 0.98, `${JSON.stringify(c)} → ${(ratio * 100).toFixed(2)}% do alvo`);
  }
});

const estimate = () => doc.getElementById('estimate').textContent;

test('estimativa de tamanho: caso real 200 MB / 1h19m23s → ≈ 198,9 MB', () => {
  fill({ h: '1', m: '19', s: '23', size: '200', audio: '160' });
  assert.equal(result(), '185');
  // (185 + 160) kbps × 1000 / 8 × 4763 s × 1,0153 = 208.547.062 bytes = 198,89 MB
  assert.match(estimate(), /≈ 198,9 MB/);
  assert.match(estimate(), /203\.660 KB na coluna Tamanho/);
});

test('estimativa nunca passa do tamanho desejado', () => {
  fill({ h: '0', m: '45', s: '30', size: '300', audio: '256' });
  const mb = Number(estimate().match(/≈ ([\d.,]+) MB/)[1].replace('.', '').replace(',', '.'));
  assert.ok(mb <= 300 && mb >= 294, `estimativa: ${mb} MB`);
});

test('estimativa em GB quando passa de 1024 MB', () => {
  fill({ h: '2', m: '0', size: '2', unit: 'GB', audio: '160' });
  assert.match(estimate(), /≈ 1,9\d GB/);
});

test('sem resultado, estimativa fica vazia', () => {
  fill({ h: '1', m: '30', size: '10' });
  assert.equal(estimate(), '—');
});

test('tela tem só os campos de duração, tamanho e áudio', () => {
  const ids = [...doc.querySelectorAll('input, select')].map((el) => el.id);
  assert.deepEqual(ids, ['hours', 'minutes', 'seconds', 'size', 'sizeUnit', 'audio']);
});

test('botão Copiar copia o número e confirma na tela', async () => {
  fill({ h: '1', m: '30', size: '700' });
  copyButton().click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, ['937']);
  assert.equal(copyButton().textContent, 'Copiado!');
});
