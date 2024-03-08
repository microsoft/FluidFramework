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
			} else {
				c8.exclude = ["src/test/**/*.*ts", "lib/test/**/*.*js"];
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

function removeUnusedDeps(pkgRoot) {
	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	let emit = false;
	const scriptText = JSON.stringify(pkg.scripts);

	const cmdlineDeps = [
		{ re: /\bcopyfiles\b/, deps: ["copyfiles"] },
		{ re: /\bcross-env\b/, deps: ["cross-env"] },
		{ re: /\bapi-extractor\b/, deps: ["@microsoft/api-extractor"] },
	];

	for (const { re, deps } of cmdlineDeps) {
		if (scriptText.match(re) === null) {
			for (const dep of deps) {
				delete pkg.devDependencies[dep];
			}
			emit = true;
		}
	}

	const scriptDeps = [
		{ name: "check:are-the-types-wrong", deps: ["@arethetypeswrong/cli"] },
		{ name: "test:jest", deps: [
			"@fluidframework/test-tools",
			"@types/jest-environment-puppeteer",
			"@types/jest",
			"expect-puppeteer",
			"puppeteer",
			"jest-environment-puppeteer",
			"jest",
			"jest-junit",
			"jest-puppeteer",
			"ts-jest",
		]}
	];

	for (const { name, deps } of scriptDeps) {
		if (pkg.scripts[name] === undefined) {
			for (const dep of deps) {
				delete pkg.devDependencies[dep];
			}
			emit = true;
		}
	}

	if (emit) {
		fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));
		return true;
	}

	return false;
}

function tryDelete(path) {
	if (fs.existsSync(path)) {
		fs.unlinkSync(path);
	}
}

function removeUnusedTestInfra(pkgRoot) {
	let emit = false;

	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	const tsconfigPath = path.join(pkgRoot, "tsconfig.json");
	const tsconfig = JSON5.parse(fs.readFileSync(tsconfigPath, "utf8"));
	const compilerOptions = tsconfig.compilerOptions;

	if (compilerOptions.types !== undefined && pkg.scripts["test:jest"] === undefined) {
		tryDelete(path.join(pkgRoot, "jest.config.cjs"));
		tryDelete(path.join(pkgRoot, "jest-puppeteer.config.cjs"));
		const jestTypes = ["jest", "puppeteer", "jest-environment-puppeteer", "expect-puppeteer"];
		compilerOptions.types = compilerOptions.types.filter((type) => !jestTypes.includes(type));
		emit = true;
	}

	if (emit) fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 4));

	return emit;
}

function removeUnusedApiExtractorInfra(pkgRoot) {
	let emit = false;

	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	const scriptText = JSON.stringify(pkg.scripts);
	if (scriptText.match(/\bapi-extractor\b/) === null) {
		tryDelete(path.join(pkgRoot, "api-extractor.json"));
		tryDelete(path.join(pkgRoot, "api-extractor-cjs.json"));
		tryDelete(path.join(pkgRoot, "api-extractor-esm.json"));
		tryDelete(path.join(pkgRoot, "api-extractor-lint.json"));
	}

	return false;
}


const pkgRoot = process.cwd();
let needsFormat = false;
needsFormat |= patchMochaConfig(pkgRoot);
needsFormat |= disableCjsTests(pkgRoot);
needsFormat |= useEsmForCodeCoverage(pkgRoot);
needsFormat |= includeEsmInPostPack(pkgRoot);
needsFormat |= removeUnusedDeps(pkgRoot);
needsFormat |= removeUnusedTestInfra(pkgRoot);
needsFormat |= removeUnusedApiExtractorInfra(pkgRoot);
if (needsFormat) format();
