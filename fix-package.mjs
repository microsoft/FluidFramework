// Run: 'flub exec "packages/test/test-node10-support/scripts/find-alpha-packages.mjs"'

import fs from "fs";
import path from "path";

const pkgPath = path.resolve("./package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

let hasNonDefaultExports = false;

// Insert '/lib' into export maps
if (pkg.exports !== undefined) {
	let exportMap = {};
	for (let [key, map] of Object.entries(pkg.exports)) {
		// Skip root key.
		if (key === "./alpha" || key === "./beta") {
			hasNonDefaultExports = true;
			const parts = key.split("/");
			if (parts[1] !== "lib") {
				parts.splice(/* start: */ 1, /* deleteCount: */ 0, "lib");
				key = parts.join("/");
			}
		}

		exportMap = { ...exportMap, [key]: map };
	}
	pkg.exports = exportMap;
}

// Update ATTW
if (hasNonDefaultExports) {
	pkg.scripts["check:are-the-types-wrong"] = "--entrypoints . ./lib/alpha ./lib/beta";
} else if (pkg.scripts) {
	delete pkg.scripts["check:are-the-types-wrong"];
}

// Update node10 entry points to ESM
if (fs.existsSync("./lib/index.js")) {
	if (pkg.main) { pkg.main = "./lib/index.js" };
	if (pkg.types) { pkg.types = "./lib/public.d.ts" };
}

const pkgText = JSON.stringify(pkg, null, "\t");
fs.writeFileSync(pkgPath, pkgText);
