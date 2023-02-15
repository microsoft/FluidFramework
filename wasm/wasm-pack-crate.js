// TODO: Good error messages
// TODO: Optional properties with good error messages/warnings
// TODO: Name and version aren't optional
// TODO: Good usage message if invoked incorrectly

const path = require('node:path');
const fs = require('fs');
const toml = require('toml');
const child_process = require('child_process');

const element = process.argv[2];
const name = path.basename(element);
const subTomlData = fs.readFileSync(`${element}/Cargo.toml`, 'utf-8');
const parsedSubToml = toml.parse(subTomlData);
const existingPackageJsonTemplateData = fs.readFileSync('package-combo-template.json', 'utf-8');
const parsedJson = JSON.parse(existingPackageJsonTemplateData);
const outputJsonPath = path.join("web-packages", element, "package.json");
parsedJson.name = `@fluid-experimental/${parsedSubToml.package.name}`;
parsedJson.module = "./" + path.join("bundler", `${parsedSubToml.package.name}.js`);
parsedJson.types = "./" + path.join("nodejs", `${parsedSubToml.package.name}.d.ts`);
parsedJson.main = "./" + path.join("nodejs", `${parsedSubToml.package.name}.js`);
parsedJson.version = parsedSubToml.package.version;
if (parsedSubToml.package.description !== undefined) {
    parsedJson.description = parsedSubToml.package.description;
} else {
    delete parsedJson.description;
}
child_process.execSync(`wasm-pack build --target bundler --out-dir ../web-packages/${name}/bundler ${element}`);
child_process.execSync(`wasm-pack build --target nodejs --out-dir ../web-packages/${name}/nodejs ${element}`);
console.log("writing file", outputJsonPath);
fs.writeFileSync(outputJsonPath, JSON.stringify(parsedJson, undefined, 4));