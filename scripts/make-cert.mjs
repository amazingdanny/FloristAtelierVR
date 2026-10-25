// Creates a self-signed certificate in ./certs so the server can also serve HTTPS on your LAN
// (WebXR on a VR headset only works over HTTPS). Requires the `openssl` command (built into macOS/Linux;
// on Windows it ships with Git for Windows).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'certs');
fs.mkdirSync(dir, { recursive: true });
const ips = [];
for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map(ip => 'IP:' + ip)].join(',');
const cfg = path.join(dir, 'openssl.cnf');
fs.writeFileSync(cfg, `[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Atelier and Bloom (local)\n[ext]\nsubjectAltName=${san}\nbasicConstraints=CA:FALSE\n`);
try {
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 825 -keyout "${path.join(dir, 'key.pem')}" -out "${path.join(dir, 'cert.pem')}" -config "${cfg}"`, { stdio: 'inherit' });
  console.log('\n✅ Certificate created in ./certs — restart with "npm start".');
  console.log('   On the headset open https://<this-computer-ip>:3443/florist and accept the warning once.');
} catch (e) {
  console.error('\n❌ Could not run openssl. Use an HTTPS tunnel or deploy online instead (see README).');
  process.exit(1);
}
