/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IPackageManager, PackageManagerName } from "./types.js";

export class PackageManager implements IPackageManager {
	public readonly lockfileNames: string[];

	/**
	 * Instantiates a new package manager object. Prefer the {@link createPackageManager} function, which retuns an
	 * {@link IPackageManager}, to calling the constructor directly.
	 */
	public constructor(public readonly name: PackageManagerName) {
		switch (this.name) {
			case "npm": {
				this.lockfileNames = ["package-lock.json"];
				break;
			}

			case "pnpm": {
				this.lockfileNames = ["pnpm-lock.yaml"];
				break;
			}

			case "yarn": {
				this.lockfileNames = ["yarn.lock"];
				break;
			}

			default: {
				throw new Error(`Unknown package manager name: ${this.name}`);
			}
		}
	}

	/**
	 * {@inheritdoc IPackageManager.getInstallCommandWithArgs}
	 */
	public getInstallCommandWithArgs(updateLockfile: boolean): string[] {
		const args: string[] = ["install"];
		switch (this.name) {
			case "npm": {
				args.push(updateLockfile ? "--package-lock=true" : "--package-lock=false");
				return args;
			}

			case "pnpm": {
				args.push(updateLockfile ? "--no-frozen-lockfile" : "--frozen-lockfile");
				return args;
			}

			case "yarn": {
				return args;
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
