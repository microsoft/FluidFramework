/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as path from "path";
import { existsSync } from "fs";
import { lookUpDirSync, readFileAsync } from "./utils";

export function getEsLintConfigFilePath(dir: string) {
	// TODO: we currently don't support .yaml and .yml, or config in package.json
	const possibleConfig = [".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintrc"];
	for (const configFile of possibleConfig) {
		const configFileFullPath = path.join(dir, configFile);
		if (existsSync(configFileFullPath)) {
			return configFileFullPath;
		}
	}
	return undefined;
}

export async function getInstalledPackageVersion(packageName: string, cwd: string) {
	const resolvedPath = require.resolve(packageName, { paths: [cwd] });
	const packageJsonPath = await lookUpDirSync(resolvedPath, (currentDir) => {
		return existsSync(path.join(currentDir, "package.json"));
	});
	if (packageJsonPath === undefined) {
		throw new Error(`Unable to find package ${packageName} from ${cwd}`);
	}
	const packageJson = JSON.parse(
		await readFileAsync(path.join(packageJsonPath, "package.json"), "utf8"),
	);
	return packageJson.version;
}
