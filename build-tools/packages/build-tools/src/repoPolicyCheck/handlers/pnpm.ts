/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from "fs";
import path from "path";

import { PackageJson } from "../../common/npmPackage";
import { Handler, readFile } from "../common";

const match = /(?:^|\/)pnpm-lock\.yaml$/i;
export const handlers: Handler[] = [
	{
		// A package or workspace that uses pnpm must also have a preinstall script that tells the user to use pnpm.
		name: "pnpm-npm-package-json-preinstall",
		match,
		handler: (file) => {
			const dirname = path.dirname(file);
			const packageJsonFile = path.join(dirname, "package.json");
			let json: PackageJson;
			try {
				json = JSON.parse(readFile(packageJsonFile));
			} catch (err) {
				return "Error parsing JSON file: " + packageJsonFile;
			}

			const script: string | undefined = json.scripts?.preinstall;
			if (script) {
				const matchResult = script.match(/^node ((?:\.\.\/)*)scripts\/only-pnpm.cjs/);
				if (matchResult) {
					const onlyPnpmPath = path.join(
						dirname,
						`${matchResult[1] ?? ""}scripts/only-pnpm.cjs`,
					);
					if (!fs.existsSync(onlyPnpmPath)) {
						return `pnpm enforcement preinstall script "${onlyPnpmPath}" does not exist`;
					}
				} else {
					return `Invalid pnpm enforcement preinstall script "${script}" in package.json`;
				}
			} else {
				return `package.json missing pnpm enforcement preinstall script`;
			}
			return undefined;
		},
	},
	{
		name: "pnpm-lock-workspace",
		match,
		handler: (file) => {
			const dirname = path.dirname(file);
			const workspaceFile = path.join(dirname, "pnpm-workspace.yaml");
			if (!fs.existsSync(workspaceFile)) {
				return `missing 'pnpm-workspace.yaml' file along ${file}`;
			}
			return undefined;
		},
	},
	{
		name: "pnpm-lock-no-package-lock",
		match,
		handler: (file) => {
			const dirname = path.dirname(file);
			const packageLockFile = path.join(dirname, "package-lock.json");
			if (fs.existsSync(packageLockFile)) {
				return `'package-lock.json' file exist along ${file}`;
			}
			return undefined;
		},
	},
];
