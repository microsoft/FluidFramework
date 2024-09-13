/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unlinkSync } from "node:fs";
import path from "node:path";
import type { IFluidBuildConfig } from "@fluidframework/build-tools";
import { getFluidBuildConfig } from "@fluidframework/build-tools";
import { FlubConfig, getFlubConfig } from "../../config.js";
import { Handler } from "./common.js";

const lockFilePattern = /.*?package-lock\.json$/i;
let _knownPaths: string[] | undefined;

const getKnownPaths = (config: FlubConfig, repoConfig: IFluidBuildConfig): string[] => {
	if (_knownPaths === undefined) {
		// Add the root path (.) because a lockfile is expected there
		_knownPaths = ["."];

		// Add additional paths from the manifest
		_knownPaths.push(...(config.policy?.additionalLockfilePaths ?? []));

		if (repoConfig.repoPackages) {
			// Add paths to known monorepos and packages
			const vals = Object.values(repoConfig.repoPackages).filter(
				(p) => typeof p === "string",
			) as string[];
			_knownPaths.push(...vals);

			// Add paths from entries that are arrays
			const arrayVals = Object.values(repoConfig.repoPackages).filter(
				(p) => typeof p !== "string",
			);
			for (const arr of arrayVals) {
				if (Array.isArray(arr)) {
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					_knownPaths.push(...arr.map((p) => p.toString()));
				}
			}
		}
	}
	return _knownPaths;
};

export const handlers: Handler[] = [
	{
		name: "extraneous-lockfiles",
		match: lockFilePattern,
		handler: async (file: string, root: string): Promise<string | undefined> => {
			const flubConfig = getFlubConfig(root);
			const repoConfig = getFluidBuildConfig(root);
			const knownPaths: string[] = getKnownPaths(flubConfig, repoConfig);

			if (
				path.basename(file) === "package-lock.json" &&
				!knownPaths.includes(path.dirname(file))
			) {
				return `Unexpected package-lock.json file at: ${file}`;
			}

			return undefined;
		},
		resolver: (file: string, root: string): { resolved: boolean; message?: string } => {
			const flubConfig = getFlubConfig(root);
			const repoConfig = getFluidBuildConfig(root);
			const knownPaths: string[] = getKnownPaths(flubConfig, repoConfig);

			if (
				path.basename(file) === "package-lock.json" &&
				!knownPaths.includes(path.dirname(file))
			) {
				unlinkSync(file);
				return {
					resolved: true,
					message: `Deleted unexpected package-lock.json file at: ${file}`,
				};
			}

			return { resolved: true };
		},
	},
];
