const fs = require('fs');
const toml = require('toml');
const child_process = require('child_process');
const path = require('node:path');

try {
  const data = fs.readFileSync('./Cargo.toml', 'utf8');
  const parsed = toml.parse(data);
  parsed.workspace.members.forEach(element => {
    const name = path.basename(element);
    child_process.execSync(`wasm-pack build --target bundler --out-dir ../target-web/${name}-bundler ${element}`);
    child_process.execSync(`wasm-pack build --target nodejs --out-dir ../target-web/${name}-nodejs ${element}`);
  });
} catch (err) {
  console.error(err);
}


