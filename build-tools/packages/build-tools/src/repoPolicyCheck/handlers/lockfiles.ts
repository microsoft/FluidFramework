/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { unlinkSync } from "fs";
import path from "path";

import { IFluidBuildConfig, IFluidRepoPackageEntry } from "../../common/fluidRepo";
import { getFluidBuildConfig } from "../../common/fluidUtils";
import { Handler, readFile } from "../common";

const lockFilePattern = /.*?package-lock\.json$/i;
const urlPattern = /(https?[^"@]+)(\/@.+|\/[^/]+\/-\/.+tgz)/g;
const versionPattern = /"lockfileVersion"\s*:\s*\b1\b/g;

let _knownPaths: string[] | undefined;

const getKnownPaths = (manifest: IFluidBuildConfig) => {
	if (_knownPaths === undefined) {
		// Add the root path (.) because a lockfile is expected there
		_knownPaths = ["."];

		// Add additional paths from the manifest
		_knownPaths.push(...(manifest.policy?.additionalLockfilePaths ?? []));

		// Add paths to known monorepos and packages
		const vals = Object.values(manifest.repoPackages).filter(
			(p) => typeof p === "string",
		) as string[];
		_knownPaths.push(...vals);

		// Add paths from entries that are arrays
		const arrayVals = Object.values(manifest.repoPackages).filter(
			(p) => typeof p !== "string",
		) as IFluidRepoPackageEntry[];
		for (const arr of arrayVals) {
			if (Array.isArray(arr)) {
				_knownPaths.push(...arr.map((p) => p.toString()));
			}
		}
	}
	return _knownPaths;
};

export const handlers: Handler[] = [
	{
		name: "package-lockfiles-no-private-url",
		match: lockFilePattern,
		handler: (file) => {
			const content = readFile(file);
			const matches = content.match(urlPattern);
			if (matches !== null) {
				const results: string[] = [];
				const containsBadUrl = matches.some((value) => {
					const url = new URL(value);
					if (url.protocol === `https:` && url.hostname === `registry.npmjs.org`) {
						return false;
					}
					results.push(value);
					return true;
				});
				if (containsBadUrl) {
					return `A private registry URL is in lock file: ${file}:\n${results.join(
						"\n",
					)}`;
				}
			}
			return;
		},
	},
	{
		name: "package-lockfiles-npm-version",
		match: lockFilePattern,
		handler: (file) => {
			const content = readFile(file);
			const match = content.match(versionPattern);
			if (match === null) {
				return `Unexpected 'lockFileVersion' (Please use NPM v6: 'npm i -g npm@latest-6'): ${file}`;
			}
			return;
		},
	},
	{
		name: "extraneous-lockfiles",
		match: lockFilePattern,
		handler: (file, root) => {
			const manifest = getFluidBuildConfig(root);
			const knownPaths: string[] = getKnownPaths(manifest);

			if (path.basename(file) === "package-lock.json") {
				if (!knownPaths.includes(path.dirname(file))) {
					return `Unexpected package-lock.json file at: ${file}`;
				}
			}

			return undefined;
		},
		resolver: (file, root): { resolved: boolean; message?: string } => {
			const manifest = getFluidBuildConfig(root);
			const knownPaths: string[] = getKnownPaths(manifest);

			if (path.basename(file) === "package-lock.json") {
				if (!knownPaths.includes(path.dirname(file))) {
					unlinkSync(file);
					return {
						resolved: true,
						message: `Deleted unexpected package-lock.json file at: ${file}`,
					};
				}
			}

			return { resolved: true };
		},
	},
];
