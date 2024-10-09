/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPackageManager, PackageManagerName } from "./types.js";

export class PackageManager implements IPackageManager {
	/**
	 * Instantiates a new package manager object. Prefer the createPackageManager function to calling the constructor
	 * directly.
	 */
	public constructor(public readonly name: PackageManagerName) {}

	public installCommand(updateLockfile: boolean): string {
		switch (this.name) {
			case "npm": {
				const command = "install";
				const update = updateLockfile ? "--package-lock=true" : "--package-lock=false";
				return `${command} ${update}`;
			}

			case "pnpm": {
				const command = "install";
				const update = updateLockfile ? "--no-frozen-lockfile" : "--frozen-lockfile";
				return `${command} ${update}`;
			}

			case "yarn": {
				return "install";
			}

			default: {
				throw new Error(`Unknown package manager name: ${this.name}`);
			}
		}
	}
}

/**
 * Create a new package manager instance.
 */
export function createPackageManager(name: PackageManagerName): IPackageManager {
	return new PackageManager(name);
}
