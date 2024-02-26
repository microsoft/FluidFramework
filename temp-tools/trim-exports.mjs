// alias c='node /workspaces/f0/temp-tools/convert.mjs'
// flub exec "node /workspaces/f0/temp-tools/convert.mjs" -g client

import { repoRoot } from "./git.mjs";
import JSON5 from "json5";
import path from "path";
import fs from "fs";
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
const pkgSrc = fs.readFileSync(pkgPath, "utf8");

const pkg = JSON5.parse(pkgSrc);

// Fix doc builds
pkg.scripts["api"] = pkg.scripts["build:docs"] = "fluid-build . --task api";
pkg.scripts["api-extractor:commonjs"] = "api-extractor run --config ./api-extractor-cjs.json";
pkg.scripts["api-extractor:esnext"] = "api-extractor run --local";
pkg.fluidBuild = {
	"tasks": {
		"build:docs": {
			"dependsOn": [
				"...",
				"api-extractor:commonjs",
				"api-extractor:esnext"
			],
			"script": false
		}
	}
};
fs.unlink("api-extractor-esm.json", () => {});

// Fix test scripts
if (pkg.scripts["test:mocha"]) {
	pkg.scripts["test:mocha:cjs"] =
		'mocha  --recursive "dist/test/*.spec.*js" --exit -r node_modules/@fluid-internal/mocha-test-setup';
	pkg.scripts["test:mocha:esm"] =
		'mocha  --recursive "lib/test/*.spec.*js" --exit -r node_modules/@fluid-internal/mocha-test-setup';
}

function loadDts(exportName) {
	const dtsPath = pkg.exports[exportName]?.import?.types;

	if (dtsPath !== undefined) {
		return fs.readFileSync(path.join(packageRoot, dtsPath), "utf8")
			.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.join("\n");
	}

	return undefined;
}

const dtsNames = ["./public", "./beta", "./alpha", "./internal"];

let prevDts = loadDts(dtsNames[0]);
for (let i = 1; i < dtsNames.length; i++) {
	let dtsName = dtsNames[i];
	const currentDts = loadDts(dtsName) ?? prevDts;
	if (currentDts === prevDts) {
		delete pkg.exports[dtsName];
	}
	prevDts = currentDts;
}

delete pkg.exports["./fruit"];

// Write package.json
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

format();