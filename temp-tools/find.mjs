import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { repoRoot } from "./git.mjs";

async function findPackageJson(name, directory = repoRoot()) {
	const files = await readdir(directory);

	for (const file of files) {
		if (file === "node_modules") {
			continue;
		}

		const filePath = join(directory, file);
		const fileStats = await stat(filePath);

		if (fileStats.isDirectory()) {
			const packageJsonPath = join(filePath, "package.json");

			try {
				const packageJsonData = await readFile(packageJsonPath, "utf8");
				const packageJson = JSON.parse(packageJsonData);

				if (packageJson.name.split("/")[1] === name) {
					return resolve(filePath);
				}
			} catch (error) {
				// Ignore errors when reading or parsing package.json
			}

			const subdirectoryResult = await findPackageJson(name, filePath);
			if (subdirectoryResult) {
				return subdirectoryResult;
			}
		}
	}

	return null;
}

const packageName = process.argv[2];
const packageJsonPath = await findPackageJson(packageName);
console.log(`${packageJsonPath}`);
