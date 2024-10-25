/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import { PackageJson } from "@fluidframework/build-tools";
import { getFlubConfig } from "../../config.js";
import { Handler, readFile } from "./common.js";

const match = /(?:^|\/)pnpm-lock\.yaml$/i;
export const handlers: Handler[] = [
	{
		// A workspace that uses pnpm must also have a preinstall script that tells the user to use pnpm.
		name: "pnpm-npm-package-json-preinstall",
		match,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			const dirname = path.dirname(file);
			const packageJsonFile = path.join(dirname, "package.json");
			const manifest = getFlubConfig(root);

			let json: PackageJson;
			try {
				json = JSON.parse(readFile(packageJsonFile)) as PackageJson;
			} catch {
				return `Error parsing JSON file: ${packageJsonFile}`;
			}

			// Ignore any paths in the policy configuration.
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (manifest.policy?.pnpmSinglePackageWorkspace?.includes(json.name)) {
				return undefined;
			}

			const script: string | undefined = json.scripts?.preinstall;
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
		// A package or workspace that uses pnpm must have a pnpm-workspace.yaml file, even if it is just a single package.
		// This is needed because we have a workspace in the root so independent packages need one at the package level to override it.
		name: "pnpm-lock-workspace",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			const dirname = path.dirname(file);
			const workspaceFile = path.join(dirname, "pnpm-workspace.yaml");
			if (!fs.existsSync(workspaceFile)) {
				return `missing 'pnpm-workspace.yaml' file along ${file}`;
			}
			return undefined;
		},
	},
	{
		// A package or workspace that uses pnpm must not have an npm package-lock.json file.
		name: "pnpm-lock-no-package-lock",
		match,
		handler: async (file: string): Promise<string | undefined> => {
			const dirname = path.dirname(file);
			const packageLockFile = path.join(dirname, "package-lock.json");
			if (fs.existsSync(packageLockFile)) {
				return `'package-lock.json' file exist along ${file}`;
			}
			return undefined;
		},
	},
];
