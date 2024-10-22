/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPackageManager, PackageManagerName } from "./types.js";

export class PackageManager implements IPackageManager {
	public readonly lockfileName: string;

	/**
	 * Instantiates a new package manager object. Prefer the createPackageManager function to calling the constructor
	 * directly.
	 */
	public constructor(public readonly name: PackageManagerName) {
		switch (this.name) {
			case "npm": {
				this.lockfileName = "package-lock.json";
				break;
			}

			case "pnpm": {
				this.lockfileName = "pnpm-lock.yaml";
				break;
			}

			case "yarn": {
				this.lockfileName = "yarn.lock";
				break;
			}

			default: {
				throw new Error(`Unknown package manager name: ${this.name}`);
			}
		}
	}

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
