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

// Load 'package.json'
const pkgPath = path.join(packageRoot, "package.json");
const pkgSrc = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON5.parse(pkgSrc);

function loadDts(exportName) {
	try {
		const dtsPath = pkg.exports[exportName]?.import?.types;

		if (dtsPath !== undefined) {
			console.log("Loaded dts: ", dtsPath);
			return fs.readFileSync(path.join(packageRoot, dtsPath), "utf8")
				.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
				.split("\n")
				.filter((line) => line.trim().length > 0)
				.join("\n");
		} else {
			console.log("No dts: ", dtsPath);
		}


	} catch {
		console.warn(`Unable to load *.d.ts for ${exportName}.`);
	}

	return undefined;
}

const dtsNames = ["./public", "./beta", "./alpha", "./internal"];

let prevDts = loadDts(dtsNames[0]);
if (prevDts !== undefined) { 
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
}