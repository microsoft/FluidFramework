// Run: 'flub exec "packages/test/test-node10-support/scripts/find-alpha-packages.mjs"'

import fs from "fs";
import path from "path";

const pkgPath = path.resolve("./package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

// Insert '/lib' into export maps
let exportMap = {};
for (let [key, map] of Object.entries(pkg.exports)) {
	// Skip root key.
	if (key !== "." && key !== "./") {
		const parts = key.split("/");
		if (parts[1] !== "lib") {
			parts.splice(/* start: */ 1, /* deleteCount: */ 0, "lib");
			key = parts.join("/");
		}
	}
	exportMap = { ...exportMap, [key]: map };
}
pkg.exports = exportMap;

// Update ATTW
pkg.scripts["check:are-the-types-wrong"] = "attw --pack";

console.log(JSON.stringify(pkg.exports, undefined, "\t"));
