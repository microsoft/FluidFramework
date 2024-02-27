import JSON5 from "json5";
import path from "path";
import fs from "fs";
import { repoRoot } from "./git.mjs";
import { forEachPackage } from "./forEachPackage.mjs";

const rootDir = repoRoot();
let totalCount = 0;
let node16Count = 0;
let trimCount = 0;

const excludes = ["/tools/", "/server/", "/docs/", "/build-tools/", "/common/build/"].map((dir) => path.resolve(path.join(rootDir, dir)));

await forEachPackage((pkgRoot) => {
	for (const exclude of excludes) {
		if (pkgRoot.startsWith(exclude)) {
			return;
		}
	}

	if (pkgRoot.includes("node_modules")) {
		return;
	}

	const pkgPath = path.join(pkgRoot, "package.json");
	const pkgText = fs.readFileSync(pkgPath, "utf8");
	const pkg = JSON5.parse(pkgText);

	const isEsm = pkg.type === "module";
	
	const hasExports =
		pkg.exports !== undefined &&
		pkg.exports["."] !== undefined &&
		pkg.exports["."].import !== undefined &&
		pkg.exports["."].import.types !== undefined;

	const isNode16  = isEsm && hasExports && pkgText.indexOf("tsc-multi") === -1;
	const isTrimmed = isNode16 && pkg.exports["."].import.types.endsWith("-public.d.ts");

	console.log(pkgRoot, isNode16, isTrimmed);

	totalCount++;
	if (isNode16) { node16Count++ };
	if (isTrimmed) { trimCount++ };
});

console.log(`Total: ${totalCount}`);
console.log(`Node 16: ${totalCount - node16Count}`);
console.log(`Trim: ${totalCount - trimCount}`);
