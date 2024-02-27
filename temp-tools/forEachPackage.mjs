import { readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import { repoRoot } from "./git.mjs";

export async function forEachPackage(callback, directory = repoRoot()) {
	const files = await readdir(directory);

	for (const file of files) {
		if (file === "node_modules") {
			continue;
		}

		if (file === "package.json") {
			callback(directory);
		}

		const candidate = resolve(join(directory, file));
		const candidateStats = await stat(candidate);
		if (candidateStats.isDirectory()) {
			await forEachPackage(callback, candidate);
		}
	}
}
