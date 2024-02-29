import path from "path";
import fs from "fs";

import { needsMochaTestSetup } from "./mocha.mjs";

function patchMochaConfig(cjsPath) {
	// Remove '-r node_modules/@fluid-internal/mocha-test-setup' from the package.json
	// if it is already included in .mocharc.cjs.
	const pkgRoot = process.cwd();
	const pkgPath = path.join(pkgRoot, "package.json");
	let pkgText = fs.readFileSync(pkgPath, "utf8");
	if (!needsMochaTestSetup(pkgRoot)) {
		pkgText = pkgText.replaceAll(" -r node_modules/@fluid-internal/mocha-test-setup", "");
		fs.writeFileSync(pkgPath, pkgText);
	}
}

function disableCjsTests(pkgRoot) {
	const fromTexts = [
		`"npm run test:mocha:cjs && npm run test:mocha:esm"`,
		`"npm run test:mocha:esm && npm run test:mocha:cjs"`,
	];
	const toText = `"npm run test:mocha:esm && echo skipping cjs to avoid overhead - npm run test:mocha:cjs"`;
	const pkgPath = path.join(pkgRoot, "package.json");
	let pkgText = fs.readFileSync(pkgPath, "utf8");

	for (const fromText of fromTexts) {
		if (pkgText.indexOf(fromText) !== -1) {
			console.log(`Patching ${pkgPath}`);
			pkgText = pkgText.replaceAll(fromText, toText);
			fs.writeFileSync(pkgPath, pkgText);
			return;
		}
	}
}

const pkgRoot = process.cwd();
disableCjsTests(pkgRoot);
