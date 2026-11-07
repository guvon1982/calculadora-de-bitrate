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

// Os testes dos encodes reais (todos de 24 fps) usam fps '24' por padrão aqui;
// o padrão da TELA é 30 e tem teste próprio.
function fill({ h = '', m = '', s = '', size = '', unit = 'MB', audio = '128', fps = '24' }) {
  type('hours', h);
  type('minutes', m);
  type('seconds', s);
  type('sizeUnit', unit);
  type('audio', audio);
  type('fps', fps);
  type('size', size);
}

// --- Modelo do que o HandBrake realmente grava, calibrado com um encode real ---
// Logs do HandBrake 1.10.2 (x264 multi-pass, MP4, 24 fps, áudio AAC 160 kbps, 48 kHz).
// "vídeo" e "áudio" são os bytes de cada trilha no log; "arquivo" é o tamanho no disco.
// Conclusões: 1 kbps do HandBrake = 1000 bits/s, e o "envelope" do MP4 (índices e
// cabeçalhos) depende da DURAÇÃO (~715 bytes por segundo), não do bitrate nem de %.
const REAL_ENCODES = [
  // pedido 185 kbps (e um encode anterior a 215 kbps deu o MESMO envelope: 3.408.379 B)
  { videoKbps: 185, seconds: 4763.13, videoBytes: 110122747, audioBytes: 95277270, fileBytes: 208808396 },
  // pedido 39 kbps: bitrate baixíssimo, envelope = 2,8% do arquivo
  { videoKbps: 39, seconds: 8259.54, videoBytes: 40232208, audioBytes: 165232298, fileBytes: 211346156 },
  // pedido 740 kbps: bitrate alto, envelope = 0,6% do arquivo
  { videoKbps: 740, seconds: 1825.46, videoBytes: 168826765, audioBytes: 36307414, fileBytes: 206444218 },
];
const AUDIO_KBPS = 160;
const overheadOf = (e) => e.fileBytes - (e.videoBytes + e.audioBytes);
const MP4_OVERHEAD_PER_SECOND =
  REAL_ENCODES.reduce((sum, e) => sum + overheadOf(e) / e.seconds, 0) / REAL_ENCODES.length;

function handbrakeFileBytes(videoKbps, audioKbps, seconds) {
  const streamBytes = ((videoKbps + audioKbps) * 1000 / 8) * seconds;
  return streamBytes + MP4_OVERHEAD_PER_SECOND * seconds;
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

// Fórmula: (MB × 1024 × 1024 bytes ÷ segundos − 720 bytes/s do container) × 8 ÷ 1000
// = kbps total; menos o áudio; arredonda para baixo
test('700 MB em 1h30 com áudio 128 → 953 kbps', () => {
  // (734.003.200 / 5400 − 720) × 8 / 1000 = 1081,65 kbps total − 128 = 953,65 → 953
  fill({ h: '1', m: '30', s: '0', size: '700' });
  assert.equal(result(), '953');
  assert.equal(copyButton().disabled, false);
  assert.equal(warningVisible(), false);
});

test('converte GB para MB (1 GB = 1024 MB)', () => {
  // (2.147.483.648 / 5400 − 720) × 8 / 1000 = 3175,70 − 128 = 3047,70 → 3047
  fill({ h: '1', m: '30', size: '2', unit: 'GB' });
  assert.equal(result(), '3047');
});

test('soma horas, minutos e segundos', () => {
  // 1h 1m 1s = 3661 s; (524.288.000 / 3661 − 720) × 8 / 1000 = 1139,95 − 128 = 1011,95 → 1011
  fill({ h: '1', m: '1', s: '1', size: '500' });
  assert.equal(result(), '1011');
});

test('respeita bitrate de áudio alterado', () => {
  // mesmo caso de 953, mas áudio 192 → 1081,65 − 192 = 889,65 → 889
  fill({ h: '1', m: '30', size: '700', audio: '192' });
  assert.equal(result(), '889');
});

test('atualiza em tempo real a cada digitação', () => {
  fill({ h: '1', m: '30', size: '700' });
  assert.equal(result(), '953');
  type('size', '1400');
  // (1.468.006.400 / 5400 − 720) × 8 / 1000 = 2169,06 − 128 = 2041,06 → 2041
  assert.equal(result(), '2041');
});

test('tamanho pequeno demais mostra aviso e bloqueia cópia', () => {
  fill({ h: '1', m: '30', size: '10' });
  assert.equal(result(), '—');
  assert.equal(warningVisible(), true);
  assert.equal(copyButton().disabled, true);
});

test('sobra de menos de 1 kbps para o vídeo também é aviso', () => {
  // 2 MB em 101 s: (2.097.152 / 101 − 720) × 8 / 1000 = 160,35 kbps total − 160 = 0,35 → arredondaria para 0
  fill({ m: '1', s: '41', size: '2', audio: '160' });
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
  // áudio negativo vira 0 → 1081,65 → 1081
  assert.equal(result(), '1081');
});

test('o envelope do MP4 é constante por segundo, e NÃO uma porcentagem do arquivo', () => {
  const perSecond = REAL_ENCODES.map((e) => overheadOf(e) / e.seconds);
  for (const value of perSecond) {
    assert.ok(Math.abs(value - MP4_OVERHEAD_PER_SECOND) / MP4_OVERHEAD_PER_SECOND < 0.01,
      `envelope por segundo: ${perSecond.map((v) => v.toFixed(1))} B/s`);
  }
  // já em porcentagem do arquivo varia mais de 4 vezes (0,6% a 2,8%): por isso uma
  // reserva fixa de 2% errava para mais em vídeos longos e para menos nos curtos
  const percent = REAL_ENCODES.map((e) => overheadOf(e) / e.fileBytes);
  assert.ok(Math.max(...percent) / Math.min(...percent) > 4);
});

test('modelo do HandBrake reproduz os arquivos reais com erro < 0,2%', () => {
  for (const e of REAL_ENCODES) {
    const predicted = handbrakeFileBytes(e.videoKbps, AUDIO_KBPS, e.seconds);
    const error = Math.abs(predicted - e.fileBytes) / e.fileBytes;
    // sobra ~0,1% porque o áudio real oscila até 0,6% abaixo do nominal (159,1 kbps no 3º)
    assert.ok(error < 0.002, `${e.videoKbps} kbps: erro do modelo ${(error * 100).toFixed(3)}%`);
  }
});

// Regressão dos encodes reais do usuário: todos pediram 200 MB com áudio 160.
//  - 2h17m39s (8259 s) saiu com 201,5 MB (acima do alvo: envelope de 2,8%, e não 2%)
//  - 0h30m25s (1825 s) saiu com 196,9 MB (1,5% abaixo: envelope de 0,6%)
//  - 1h19m23s (4763 s) foi o caso que já acertava
for (const c of [
  { name: '1h19m23s', h: '1', m: '19', s: '23', seconds: 4763 },
  { name: '2h17m39s', h: '2', m: '17', s: '39', seconds: 8259 },
  { name: '0h30m25s', h: '0', m: '30', s: '25', seconds: 1825 },
]) {
  test(`caso real: 200 MB em ${c.name} com áudio padrão fica entre 99,5% e 100% do alvo`, () => {
    fill({ h: c.h, m: c.m, s: c.s, size: '200', audio: doc.getElementById('audio').value });
    const fileMb = handbrakeFileBytes(Number(result()), AUDIO_KBPS, c.seconds) / WINDOWS_MB;
    assert.ok(fileMb <= 200 && fileMb >= 199, `arquivo previsto: ${fileMb.toFixed(2)} MB`);
  });
}

test('áudio padrão é 160 kbps, igual aos presets do HandBrake', () => {
  assert.equal(doc.getElementById('audio').value, '160');
});

test('vários tamanhos e durações ficam entre 99,5% e 100% do alvo', () => {
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
    assert.ok(ratio <= 1 && ratio >= 0.995, `${JSON.stringify(c)} → ${(ratio * 100).toFixed(2)}% do alvo`);
  }
});

const estimate = () => doc.getElementById('estimate').textContent;

test('estimativa de tamanho: caso real 200 MB / 1h19m23s → ≈ 199,7 MB', () => {
  fill({ h: '1', m: '19', s: '23', size: '200', audio: '160' });
  // (209.715.200 / 4763 − 720) × 8 / 1000 = 346,5 kbps total − 160 = 186,5 → 186
  assert.equal(result(), '186');
  // (346 kbps × 125 + 720) bytes/s × 4763 s = 209.429.110 bytes = 199,73 MB = 204.521 KB
  assert.match(estimate(), /≈ 199,7 MB/);
  assert.match(estimate(), /204\.521 KB na coluna Tamanho/);
});

test('estimativa nunca passa do tamanho desejado', () => {
  fill({ h: '0', m: '45', s: '30', size: '300', audio: '256' });
  const mb = Number(estimate().match(/≈ ([\d.,]+) MB/)[1].replace('.', '').replace(',', '.'));
  assert.ok(mb <= 300 && mb >= 294, `estimativa: ${mb} MB`);
});

test('estimativa em GB quando passa de 1024 MB', () => {
  fill({ h: '2', m: '0', size: '2', unit: 'GB', audio: '160' });
  // estimativa ≈ 2.047,7 MB = 1,9997 GB, que aparece arredondado: 2,00 GB
  assert.match(estimate(), /≈ 2,00 GB/);
});

test('sem resultado, estimativa fica vazia', () => {
  fill({ h: '1', m: '30', size: '10' });
  assert.equal(estimate(), '—');
});

test('tela tem os campos de duração, tamanho, áudio e fps', () => {
  const ids = [...doc.querySelectorAll('input, select')].map((el) => el.id);
  assert.deepEqual(ids, ['hours', 'minutes', 'seconds', 'size', 'sizeUnit', 'audio', 'fps']);
});

// O envelope do MP4 depende do fps: cada quadro de vídeo vira um "chunk" no arquivo
// e a tabela do índice (stsz, ctts, sdtp, stco, stsc) cresce com eles. A conta está em
// containerBytesPerSecond(): 719,85 B/s a 24 fps (igual ao medido: 712 a 718 + 5 de folga),
// 788,7 a 25, 1132,9 a 30, 1284,9 a 50 e 1653,4 a 60.
test('o padrão da tela é 30 fps, e as opções são 24, 25, 30, 50 e 60', () => {
  const fpsSelect = doc.getElementById('fps');
  assert.equal(fpsSelect.value, '30');
  assert.deepEqual([...fpsSelect.options].map((o) => o.value), ['24', '25', '30', '50', '60']);
});

test('700 MB em 1h30 com áudio 160: o fps maior desconta mais envelope', () => {
  // bytes por segundo = 734.003.200 / 5400 = 135.926,52; (− envelope) × 8 / 1000 − 160, para baixo
  const expected = { 24: '921', 25: '921', 30: '918', 50: '917', 60: '914' };
  for (const [fps, kbps] of Object.entries(expected)) {
    fill({ h: '1', m: '30', size: '700', audio: '160', fps });
    assert.equal(result(), kbps, `${fps} fps`);
  }
});

// Encodes REAIS de 30 e 60 fps (HandBrake 1.10.2, Constant Framerate, 2 minutos, AAC 48 kHz).
// Os kbps vêm das linhas "mux: track" do log; o envelope é o arquivo menos as trilhas.
//  - 30 fps (3.600 quadros): envelope 137.021 e 137.185 B (~1.142 B/s, contando ~890 B fixos
//    do arquivo). Índice: 3.599 chunks e 3.149 entradas no stsc (previsto: 3.600 e 3.150).
//  - 60 fps (7.200 quadros): envelope 200.177 B (previsto 198.692, +0,75%). Índice: 5.625
//    chunks por trilha (previsto 5.625) e 3.151 entradas de stsc no VÍDEO (previsto 3.150).
const REAL_ENCODES_HIGH_FPS = [
  { fps: '30', seconds: 120, videoKbps: 702.40, fileBytes: 13078341 },
  { fps: '30', seconds: 120, videoKbps: 705.52, fileBytes: 13121264 },
  { fps: '60', seconds: 120, videoKbps: 714.76, fileBytes: 13321400 },
];

test('30 e 60 fps: para o tamanho de um arquivo real, a calculadora devolve o bitrate que o HandBrake usou', () => {
  for (const e of REAL_ENCODES_HIGH_FPS) {
    fill({ s: String(e.seconds), size: String(e.fileBytes / WINDOWS_MB), audio: '160', fps: e.fps });
    const diff = Number(result()) - e.videoKbps;
    // (com o desconto de 24 fps daria 706 a 30 fps e 722 a 60 fps: o teste pega a diferença)
    assert.ok(Math.abs(diff) <= 1.5, `${e.fps} fps: HandBrake usou ${e.videoKbps} kbps, a tela deu ${result()}`);
  }
});

test('com o fps padrão (30) a estimativa não passa de 200 MB', () => {
  type('hours', '1'); type('minutes', '19'); type('seconds', '23'); type('size', '200'); type('audio', '160');
  // (44.029,5 − 1.132,9) × 8 / 1000 = 343,17 kbps total − 160 = 183,17 → 183
  assert.equal(result(), '183');
  // (343 × 125 + 1.132,9) × 4763 s = 209.609.627 bytes = 199,90 MB
  assert.match(estimate(), /≈ 199,9 MB/);
});

test('botão Copiar copia o número e confirma na tela', async () => {
  fill({ h: '1', m: '30', size: '700' });
  copyButton().click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, ['953']);
  assert.equal(copyButton().textContent, 'Copiado!');
});
