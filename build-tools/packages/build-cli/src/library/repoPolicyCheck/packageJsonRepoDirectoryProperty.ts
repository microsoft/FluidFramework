import path from "node:path";
import { type PackageJson, updatePackageJsonFile } from "@fluidframework/build-tools";
import { readJson } from "fs-extra/esm";
import type { Handler } from "./common.js";

export const PackageJsonRepoDirectoryProperty: Handler = {
	name: "PackageJsonRepoDirectoryProperty",
	match: /(^|\/)package\.json/i,
	handler: async (file: string, root: string): Promise<string | undefined> => {
		const pkg = (await readJson(file)) as PackageJson;
		const pkgDir = path.dirname(file);
		const relativePkgDir = path.relative(root, pkgDir);

		if (typeof pkg.repository === "object") {
			if (pkg.repository.directory !== relativePkgDir) {
				return `repository.directory is '${pkg.repository.directory}'; expected '${relativePkgDir}'`;
			}
		} else if (pkg.repository === undefined) {
			return `repository value is undefined; expected an object`;
		} else if (pkg.repository !== relativePkgDir) {
			return `repository value is a string '${pkg.repository}'; expected an object`;
		}

		return undefined;
	},
	resolver: (file: string, root: string) => {
		updatePackageJsonFile(file, (json) => {
			const pkgDir = path.dirname(file);
			const relativePkgDir = path.relative(root, pkgDir);
			if (typeof json.repository === "object") {
				json.repository.directory = relativePkgDir;
			} else {
				return {
					message: "repository field is a string but should be an object",
					resolved: false,
				};
			}
		});
		return { resolved: true };
	},
};
