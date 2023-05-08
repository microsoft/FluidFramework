// TODO: Good error messages
// TODO: Optional properties with good error messages/warnings
// TODO: Name and version aren't optional
// TODO: Good usage message if invoked incorrectly

const path = require("node:path");
const fs = require("fs");
const toml = require("toml");
const child_process = require("child_process");
const rimraf = require("rimraf");

const webPackagesPath = path.resolve("./web-packages");

const package = process.argv[2];
const mode_arg = process.argv[3];
let debug;
if (mode_arg === "--debug") {
	debug = true;
} else if (mode_arg === "--release") {
	debug = false;
} else {
	throw new Error("Must specify --debug or --release");
}

const name = path.basename(package);
const subTomlData = fs.readFileSync(path.join(package, "Cargo.toml"), "utf-8");
const parsedSubToml = toml.parse(subTomlData);
const existingPackageJsonTemplateData = fs.readFileSync("package-combo-template.json", "utf-8");
const parsedJson = JSON.parse(existingPackageJsonTemplateData);
const outputJsonPath = path.join(webPackagesPath, package, "package.json");
const nameWithUnderscores = name.replace(/-/g, "_");
parsedJson.name = `@fluidframework/${parsedSubToml.package.name}`;
parsedJson.module = `./bundler/${nameWithUnderscores}.js`;
parsedJson.types = `./nodejs/${nameWithUnderscores}.d.ts`;
parsedJson.main = `./nodejs/${nameWithUnderscores}.js`;
parsedJson.version = parsedSubToml.package.version;
if (parsedSubToml.package.description !== undefined) {
	parsedJson.description = parsedSubToml.package.description;
} else {
	delete parsedJson.description;
}

parsedJson.files = [
	`/nodejs/${nameWithUnderscores}_bg.wasm`,
	`/nodejs/${nameWithUnderscores}.js`,
	`/nodejs/${nameWithUnderscores}.d.ts`,
	`/bundler/${nameWithUnderscores}_bg.wasm`,
	`/bundler/${nameWithUnderscores}.js`,
	`/bundler/${nameWithUnderscores}_bg.js`,
];

function build(target) {
	const pathname = path.join(webPackagesPath, name, target);

	child_process.execSync(
		`wasm-pack build ${
			debug ? "--debug" : ""
		} --target ${target} --out-dir ${pathname} ${package}`,
	);

	const output_path = path.join(pathname, `${nameWithUnderscores}_bg.wasm`);

	child_process.execSync(
		`wasm-snip ${output_path} --snip-rust-fmt-code --snip-rust-panicking-code -o ${output_path}`,
	);

	child_process.execSync(
		`wasm-opt -O2 --enable-mutable-globals -o ${output_path} ${output_path}`,
	);
}

build("bundler");
rimraf.sync(path.join(webPackagesPath, name, "bundler", "package.json"));
rimraf.sync(path.join(webPackagesPath, name, "bundler", ".gitignore"));
build("nodejs");

rimraf.sync(path.join(webPackagesPath, name, "nodejs", "package.json"));
rimraf.sync(path.join(webPackagesPath, name, "nodejs", ".gitignore"));
fs.writeFileSync(outputJsonPath, JSON.stringify(parsedJson, undefined, 4));
