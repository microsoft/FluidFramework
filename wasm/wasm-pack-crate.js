const path = require("node:path");
const fs = require("fs");
const toml = require("toml");
const { execSync } = require("child_process");
const rimraf = require("rimraf");

const webPackagesPath = path.resolve("./web-packages");

const package = process.argv[2];
const mode_arg = process.argv[3];
if (package === undefined || mode_arg === undefined) {
	throw new Error("Usage: node wasm-pack-crate.js <package> <mode>");
}

let debug;
if (mode_arg === "--debug") {
	debug = true;
} else if (mode_arg === "--release") {
	debug = false;
} else {
	throw new Error("Must specify --debug or --release");
}

function readFileOrError(fileName) {
	try {
		return fs.readFileSync(fileName, "utf-8");
	} catch {
		throw new Error(`File ${fileName} not found`);
	}
}

const name = path.basename(package);
const subTomlData = readFileOrError(path.join(package, "Cargo.toml"));
const parsedSubToml = toml.parse(subTomlData);
const existingPackageJsonTemplateData = readFileOrError("package-combo-template.json");
const parsedJson = JSON.parse(existingPackageJsonTemplateData);
const outputJsonPath = path.join(webPackagesPath, package, "package.json");
const nameWithUnderscores = name.replace(/-/g, "_");

const webFolderName = "bundler";
const nodeFolderName = "nodejs";
const webEntryName = "entry";

if (parsedSubToml.package.name === undefined) {
	throw new Error("Cargo.toml must have a name");
}

if (parsedSubToml.package.description === undefined) {
	throw new Error("Cargo.toml must have a description");
}

if (parsedSubToml.package.version === undefined) {
	throw new Error("Cargo.toml must have a version");
}

parsedJson.name = `@fluidframework/${parsedSubToml.package.name}`;
parsedJson.description = parsedSubToml.package.description;
parsedJson.module = `./${webFolderName}/${webEntryName}.js`;
parsedJson.types = `./${nodeFolderName}/${nameWithUnderscores}.d.ts`;
parsedJson.main = `./${nodeFolderName}/${nameWithUnderscores}.js`;
parsedJson.version = parsedSubToml.package.version;

parsedJson.files = [
	`/${nodeFolderName}/${nameWithUnderscores}_bg.wasm`,
	`/${nodeFolderName}/${nameWithUnderscores}.js`,
	`/${nodeFolderName}/${nameWithUnderscores}.d.ts`,
	`/${webFolderName}/${nameWithUnderscores}_bg.wasm`,
	`/${webFolderName}/${nameWithUnderscores}.js`,
	`/${webFolderName}/${nameWithUnderscores}_bg.js`,
	`/${webFolderName}/${webEntryName}.js`,
];

parsedJson.sideEffects = [`./${webFolderName}/${nameWithUnderscores}.js`];

function build(target) {
	const pathname = path.join(webPackagesPath, name, target);

	execSync(
		`pnpm exec wasm-pack build ${
			debug ? "--debug" : ""
		} --target ${target} --out-dir ${pathname} ${package}`,
	);

	const output_path = path.join(pathname, `${nameWithUnderscores}_bg.wasm`);

	execSync(
		`wasm-snip ${output_path} --snip-rust-fmt-code --snip-rust-panicking-code -o ${output_path}`,
	);

	execSync(`pnpm exec wasm-opt -O2 --enable-mutable-globals -o ${output_path} ${output_path}`);
}

build(webFolderName);
rimraf.sync(path.join(webPackagesPath, name, webFolderName, "package.json"));
rimraf.sync(path.join(webPackagesPath, name, webFolderName, ".gitignore"));
const outputWebEntryPath = path.join(
	webPackagesPath,
	package,
	`${webFolderName}/${webEntryName}.js`,
);
fs.writeFileSync(
	outputWebEntryPath,
	`
await import("./${nameWithUnderscores}");
export * from "./${nameWithUnderscores}";
`,
);

build(nodeFolderName);
rimraf.sync(path.join(webPackagesPath, name, nodeFolderName, "package.json"));
rimraf.sync(path.join(webPackagesPath, name, nodeFolderName, ".gitignore"));

fs.writeFileSync(outputJsonPath, JSON.stringify(parsedJson, undefined, 4));
