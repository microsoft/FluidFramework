const fs = require('fs');
const toml = require('toml');
const child_process = require('child_process');

try {
  const data = fs.readFileSync('./Cargo.toml', 'utf-8');
  const parsed = toml.parse(data);
  parsed.metadata["fluid-wasm-packages"].forEach(packageName => {
    child_process.execSync(`node wasm-pack-crate.js ${packageName}`);
  });
} catch (err) {
  console.error(err);
}


