// alias c='node /workspaces/f0/temp-tools/convert.mjs'

import { repoRoot } from "./git.mjs";
import JSON5 from "json5";
import path from "path";
import fs from "fs";
import { ts2esm } from "./ts2esm.mjs";
import { format } from "./format.mjs";

// Assume current working directory is the package root.
const packageRoot = process.cwd();

// Get root of Git repo.
const repoRootPath = repoRoot();

// From the package root, compute how many repetitions of '../' get us to the repo root.
const workspaceRoot = (() => {
	const gitRootLength = repoRootPath.split(path.sep).length;
  	let relativePath = "../".repeat(packageRoot.split(path.sep).length - gitRootLength);
  	return relativePath.slice(0, relativePath.length - 1);
})();

// Load 'package.json'
const pkgPath = path.join(packageRoot, "package.json");
const pkg = JSON5.parse(fs.readFileSync(pkgPath, "utf8"));

// Set package type to ESM
pkg.type = "module";

// Add exports
//
// Note: 'exports.js' does this better (merges with existing exports rather than clobbering all exports.)
const shortName = pkg.name.split("/")[1];
pkg.exports = {
	".": {
		import: {
			types: "./lib/index.d.ts",
			default: "./lib/index.js",
		},
		require: {
			types: "./dist/index.d.ts",
			default: "./dist/index.js",
		},
	},
	"./public": {
		import: {
			types: `./lib/${shortName}-public.d.ts`,
			default: "./lib/index.js",
		},
		require: {
			types: `./dist/${shortName}-public.d.ts`,
			default: "./dist/index.js",
		},
	},
	"./beta": {
		import: {
			types: `./lib/${shortName}-beta.d.ts`,
			default: "./lib/index.js",
		},
		require: {
			types: `./dist/${shortName}-beta.d.ts`,
			default: "./dist/index.js",
		},
	},
	"./fruit": {
		import: {
			types: `./lib/${shortName}-alpha.d.ts`,
			default: "./lib/index.js",
		},
		require: {
			types: `./dist/${shortName}-alpha.d.ts`,
			default: "./dist/index.js",
		},
	},
	"./internal": {
		import: {
			types: "./lib/index.d.ts",
			default: "./lib/index.js",
		},
		require: {
			types: "./dist/index.d.ts",
			default: "./dist/index.js",
		},
	},
};

// Delete 'module' key if any.
delete pkg.module;

// Overwrite API extractor scripts with new pattern (TODO: make conditional)
pkg.scripts["api-extractor:commonjs"] = "api-extractor run --config ./api-extractor-cjs.json";
pkg.scripts["api-extractor:esnext"] = "api-extractor run --local";

// Add ATTW check
pkg.scripts["check:are-the-types-wrong"] = "attw --pack . --entrypoints .";
pkg.devDependencies["@arethetypeswrong/cli"] = "^0.13.3";

// Rewrite build scripts
pkg.scripts["build:esnext"] = "tsc --project ./tsconfig.json";

if (pkg.scripts["build:test"]) {
	pkg.scripts["build:test"] = "tsc --project ./src/test/tsconfig.json && tsc --project ./src/test/tsconfig.cjs.json";
}

if (pkg.scripts["test:mocha"]) {
	pkg.scripts["test:mocha"] = "npm run test:mocha:cjs && npm run test:mocha:esm";
	pkg.scripts["test:mocha:cjs"] = "mocha  --recursive \"dist/test/*.spec.*js\" --exit --project src/test/tsconfig.cjs.json -r node_modules/@fluidframework/mocha-test-setup";
	pkg.scripts["test:mocha:esm"] = "mocha  --recursive \"lib/test/*.spec.*js\" --exit --project src/test/tsconfig.json -r node_modules/@fluidframework/mocha-test-setup";
}

pkg.scripts["tsc"] = `tsc-multi --config ${workspaceRoot}/common/build/build-common/tsc-multi.node16.cjs.json && copyfiles -f ${workspaceRoot}/common/build/build-common/src/cjs/package.json ./dist`;
pkg.devDependencies["tsc-multi"] = "^1.1.0";
pkg.devDependencies["copyfiles"] = "^2.4.1";

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

// Update API extractor config if it exists
const apiExtractorEsmPath = path.join(packageRoot, "api-extractor.json");
if (fs.existsSync(apiExtractorEsmPath)) {
	const apiExtractorEsm = `{
		"$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
		"extends": "${workspaceRoot}/common/build/build-common/api-extractor-base.esm.primary.json"
	}
	`;
	fs.writeFileSync(apiExtractorEsmPath, apiExtractorEsm);

	const apiExtractorCjsPath = path.join(packageRoot, "api-extractor-cjs.json");
	const apiExtractorCjs = `{
		"$schema": "https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json",
		"extends": "${workspaceRoot}/common/build/build-common/api-extractor-base.cjs.primary.json",
		// CJS is actually secondary; so, no report.
		"apiReport": {
			"enabled": false
		}
	}`;
	fs.writeFileSync(apiExtractorCjsPath, apiExtractorCjs);
}

// Update tsconfig
const tsconfigPath = path.join(packageRoot, "tsconfig.json");
const tsconfigPaths = [tsconfigPath];
const tsconfig = JSON5.parse(fs.readFileSync(tsconfigPath, "utf8"));
tsconfig.extends = `${workspaceRoot}/common/build/build-common/tsconfig.node16.json`;
const compilerOptions = tsconfig.compilerOptions;

// Delete compilerOptions that are same as default
if (compilerOptions.composite === true) { delete compilerOptions.composite }
if (compilerOptions.declaration === true) { delete compilerOptions.declaration }
if (compilerOptions.declarationMap === true) { delete compilerOptions.declarationMap }
if (compilerOptions.esModuleInterop === true) { delete compilerOptions.esModuleInterop }
if (compilerOptions.incremental === true) { delete compilerOptions.incremental }
if (compilerOptions.inlineSources === true) { delete compilerOptions.inlineSources }
if (compilerOptions.jsx === "react") { delete compilerOptions.jsx }
if (compilerOptions.noImplicitAny === false) { delete compilerOptions.noImplicitAny }
if (compilerOptions.noUnusedLocals === true) { delete compilerOptions.noUnusedLocals }
if (compilerOptions.pretty === true) { delete compilerOptions.pretty }
if (compilerOptions.sourceMap === true) { delete compilerOptions.sourceMap }
if (compilerOptions.strict === true) { delete compilerOptions.strict }
if (compilerOptions.target === "ES2020") { delete compilerOptions.target }
if (compilerOptions.types?.length === 0) { delete compilerOptions.types }

// Main tsconfig is now ESM:
compilerOptions.outDir = "./lib";
delete compilerOptions.module;
delete compilerOptions.moduleResolution;

fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 4));

// Create a tsconfig.cjs.json
const tsconfigCjsPath = path.join(packageRoot, "tsconfig.cjs.json");
const tsconfigCjs = `{
	// This config must be used in a "type": "commonjs" environment. (Use tsc-mult.)
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"outDir": "./dist",
	},
}
`;
fs.writeFileSync(tsconfigCjsPath, tsconfigCjs);

// Create/overwrite test tsconfig files
const testTsconfigPath = path.join(packageRoot, "src/test/tsconfig.json");
if (fs.existsSync(testTsconfigPath)) {
	tsconfigPaths.push(testTsconfigPath);

	const testTsconfig = `{
		"extends": "${workspaceRoot}/../../common/build/build-common/tsconfig.test.node16.json",
		"compilerOptions": {
			"rootDir": "./",
			"outDir": "../../lib/test",
			"types": ["mocha", "node"],
		},
		"include": ["./**/*"],
		"references": [
			{
				"path": "../..",
			},
		],
	}
	`;
	fs.writeFileSync(testTsconfigPath, testTsconfig);

	const testTsconfigCjsPath = path.join(packageRoot, "src/test/tsconfig.cjs.json");
	const testTsconfigCjs = `{
		// This config must be used in a "type": "commonjs" environment. (Use tsc-mult.)
		"extends": "./tsconfig.json",
		"compilerOptions": {
			"outDir": "../../dist/test",
		},
		"references": [
			{
				"path": "../../tsconfig.cjs.json",
			},
		],
	}
	`;
	fs.writeFileSync(testTsconfigCjsPath, testTsconfigCjs);
}

ts2esm(tsconfigPaths);
format();
