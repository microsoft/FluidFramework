// flub exec "node /workspaces/f0/temp-tools/patch.mjs" -g client

import path from "path";
import fs from "fs";
import JSON5 from "json5";
import { format } from "./format.mjs";

import { needsMochaTestSetup } from "./mocha.mjs";

function patchMochaConfig(pkgRoot) {
	const pkgPath = path.join(pkgRoot, "package.json");
	let pkgText = fs.readFileSync(pkgPath, "utf8");

	// Remove '-r node_modules/@fluid-internal/mocha-test-setup' from the package.json
	// if it is already included in .mocharc.cjs.
	if (!needsMochaTestSetup(pkgRoot)) {
		pkgText = pkgText.replaceAll(" -r node_modules/@fluid-internal/mocha-test-setup", "");
		fs.writeFileSync(pkgPath, pkgText);
	}

	return false;
}

function disableCjsTests(pkgRoot) {
	const pkgPath = path.join(pkgRoot, "package.json");
	let pkgText = fs.readFileSync(pkgPath, "utf8");

	const fromTexts = [
		`"npm run test:mocha:cjs && npm run test:mocha:esm"`,
		`"npm run test:mocha:esm && npm run test:mocha:cjs"`,
	];
	const toText = `"npm run test:mocha:esm && echo skipping cjs to avoid overhead - npm run test:mocha:cjs"`;

	for (const fromText of fromTexts) {
		if (pkgText.indexOf(fromText) !== -1) {
			console.log(`Patching ${pkgPath}`);
			pkgText = pkgText.replaceAll(fromText, toText);
			fs.writeFileSync(pkgPath, pkgText);
		}
	}

	return false;
}

function useEsmForCodeCoverage(pkgRoot) {
	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	if (pkg.type === "module") {
		const c8 = pkg.c8;
		if (c8 !== undefined) {
			if (c8.include !== undefined) {
				for (let i = 0; i < c8.include.length; i++) {
					c8.include[i] = c8.include[i].replace(/\bdist\//, "lib/");
				}
			}
			if (c8.exclude !== undefined) {
				for (let i = 0; i < c8.exclude.length; i++) {
					c8.exclude[i] = c8.exclude[i].replace(/\bdist\//, "lib/");
				}
			}
		}

		fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
		return true;
	}

	return false;
}

function includeEsmInPostPack(pkgRoot) {
	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	if (pkg.scripts.postpack !== undefined) {
		pkg.scripts.postpack = pkg.scripts.postpack.replace(
			/.\/src\/test .\/dist\/test$/,
			"./src/test ./dist/test ./lib/test",
		);
		fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
		return true;
	}
	return false;
}

const pkgRoot = process.cwd();
let needsFormat = false;
needsFormat |= patchMochaConfig(pkgRoot);
needsFormat |= disableCjsTests(pkgRoot);
needsFormat |= useEsmForCodeCoverage(pkgRoot);
needsFormat |= includeEsmInPostPack(pkgRoot);
if (needsFormat) format();
