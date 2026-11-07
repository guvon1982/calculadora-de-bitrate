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

const result = () => doc.getElementById('result').textContent;
const warningVisible = () => doc.getElementById('warning').classList.contains('show');
const copyButton = () => doc.getElementById('copy');

test('tela inicial: campos padrão e resultado vazio', () => {
  assert.equal(doc.getElementById('audio').value, '128');
  assert.equal(doc.getElementById('sizeUnit').value, 'MB');
  assert.equal(result(), '—');
  assert.equal(warningVisible(), false);
  // botão com type="button" (não envia formulário) e desativado até haver resultado
  assert.equal(copyButton().getAttribute('type'), 'button');
  assert.equal(copyButton().disabled, true);
});

test('700 MB em 1h30 com áudio 128 → 933 kbps', () => {
  // 700 × 8192 / 5400 s = 1061,9 kbps total − 128 = 933,9 → arredonda para baixo
  fill({ h: '1', m: '30', s: '0', size: '700' });
  assert.equal(result(), '933');
  assert.equal(copyButton().disabled, false);
  assert.equal(warningVisible(), false);
});

test('converte GB para MB (1 GB = 1024 MB)', () => {
  // 2 × 1024 × 8192 / 5400 = 3106,8 − 128 = 2978,8 → 2978
  fill({ h: '1', m: '30', size: '2', unit: 'GB' });
  assert.equal(result(), '2978');
});

test('soma horas, minutos e segundos', () => {
  // 1h 1m 1s = 3661 s; 500 MB → 500 × 8192 / 3661 = 1118,8 − 128 = 990
  fill({ h: '1', m: '1', s: '1', size: '500' });
  assert.equal(result(), '990');
});

test('respeita bitrate de áudio alterado', () => {
  // mesmo caso de 933, mas áudio 192 → 1061,9 − 192 = 869
  fill({ h: '1', m: '30', size: '700', audio: '192' });
  assert.equal(result(), '869');
});

test('atualiza em tempo real a cada digitação', () => {
  fill({ h: '1', m: '30', size: '700' });
  assert.equal(result(), '933');
  type('size', '1400');
  // 1400 × 8192 / 5400 = 2123,9 − 128 = 1995
  assert.equal(result(), '1995');
});

test('tamanho pequeno demais mostra aviso e bloqueia cópia', () => {
  fill({ h: '1', m: '30', size: '10' });
  assert.equal(result(), '—');
  assert.equal(warningVisible(), true);
  assert.equal(copyButton().disabled, true);
});

test('bitrate de vídeo exatamente zero também é aviso', () => {
  // 1 MB em 64 s = 8192 / 64 = 128 kbps total, todo consumido pelo áudio
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
  // áudio negativo vira 0 → 1061
  assert.equal(result(), '1061');
});

test('botão Copiar copia o número e confirma na tela', async () => {
  fill({ h: '1', m: '30', size: '700' });
  copyButton().click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, ['933']);
  assert.equal(copyButton().textContent, 'Copiado!');
});
