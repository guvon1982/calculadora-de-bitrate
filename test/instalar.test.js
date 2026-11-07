// Teste do instalador: roda o instalar.ps1 de verdade, mas apontando para pastas
// temporárias (para não mexer na Área de Trabalho de quem roda o teste).
// Só faz sentido no Windows; em outros sistemas o teste é pulado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const isWindows = process.platform === 'win32';
const root = path.join(__dirname, '..');

function powershell(args) {
  return execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
    encoding: 'utf8',
  });
}

test('instalar.ps1 copia o app e cria atalho do Edge em modo app', { skip: !isWindows }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calc-bitrate-'));
  const installDir = path.join(tmp, 'app');
  const shortcutDir = path.join(tmp, 'atalhos');

  try {
    powershell([
      '-File', path.join(root, 'instalar.ps1'),
      '-InstallDir', installDir,
      '-ShortcutDirs', shortcutDir,
    ]);

    // arquivos copiados
    assert.ok(fs.existsSync(path.join(installDir, 'index.html')));
    assert.ok(fs.existsSync(path.join(installDir, 'icone.ico')));

    // atalho criado e apontando para o lugar certo
    const lnkPath = path.join(shortcutDir, 'Calculadora de Bitrate.lnk');
    assert.ok(fs.existsSync(lnkPath));

    const lnk = JSON.parse(powershell([
      '-Command',
      `(New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath}') | ` +
        'Select-Object TargetPath, Arguments, IconLocation | ConvertTo-Json',
    ]));

    assert.match(lnk.TargetPath, /msedge\.exe$/i);
    const expectedUrl = new URL(`file:///${path.join(installDir, 'index.html').replace(/\\/g, '/')}`).href;
    assert.ok(lnk.Arguments.includes(`--app="${expectedUrl}"`), `argumentos: ${lnk.Arguments}`);
    assert.ok(lnk.IconLocation.toLowerCase().startsWith(path.join(installDir, 'icone.ico').toLowerCase()));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
