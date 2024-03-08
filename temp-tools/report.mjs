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

function tryLoadTsConfig(pkgRoot) {
	try {
		const tsconfigPath = path.join(pkgRoot, "tsconfig.json");
		const tsconfigText = fs.readFileSync(tsconfigPath, "utf8");
		return JSON5.parse(tsconfigText);
	} catch {
		return undefined;
	}
}

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

	const tsconfig = tryLoadTsConfig(pkgRoot) ?? tryLoadTsConfig(path.join(pkgRoot, "src/test"));

	const hasExports =
		pkg.exports !== undefined &&
		pkg.exports["."] !== undefined &&
		pkg.exports["."].import !== undefined &&
		pkg.exports["."].import.types !== undefined;

	const noApi =
		pkg.exports === undefined && pkg.main === undefined && pkg.types === undefined;

	const isNode16 =
		typeof tsconfig?.extends === "string" && tsconfig.extends.endsWith(".node16.json") && pkgText.indexOf("tsc-multi") === -1;

	const isTrimmed =
		noApi || (pkg.exports && pkg.exports["."] && (
			pkg.exports["."]?.import?.types.endsWith("-public.d.ts") ||
			pkg.exports["."]?.require?.types.endsWith("-public.d.ts")
		));

	if (isTrimmed) {
		console.log(pkgRoot, noApi);
	}

	totalCount++;
	if (isNode16) { node16Count++ };
	if (isTrimmed) { trimCount++ };
});

console.log(`Total: ${totalCount}`);
console.log(`Node 16: ${node16Count}`);
console.log(`Trim: ${trimCount}`);
