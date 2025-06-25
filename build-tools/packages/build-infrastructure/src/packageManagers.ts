/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { detectSync } from "package-manager-detector";
// eslint-disable-next-line import/no-internal-modules
import { resolveCommand } from "package-manager-detector/commands";

import type {
	IPackageManager,
	PackageManagerInstallName,
	PackageManagerName,
} from "./types.js";

const lockFileMap = new Map<PackageManagerName, string[]>([
	["bun", ["bun.lock", "bun.lockb"]],
	["deno", ["deno.lock"]],
	["npm", ["package-lock.json"]],
	["pnpm", ["pnpm-lock.yaml"]],
	["yarn", ["yarn.lock"]],
]);

export class PackageManager implements IPackageManager {
	/**
	 * Instantiates a new package manager object. Prefer the {@link createPackageManager} function, which retuns an
	 * {@link IPackageManager}, to calling the constructor directly.
	 */
	public constructor(
		public readonly name: PackageManagerName,
		private readonly installName: PackageManagerInstallName,
	) {
		const entry = lockFileMap.get(name);
		if (entry === undefined) {
			throw new Error(`Lockfiles not known for package manager "${name}"`);
		}
		this.lockfileNames = entry;
	}

	public readonly lockfileNames: string[];

	/**
	 * {@inheritdoc IPackageManager.getInstallCommandWithArgs}
	 */
	public getInstallCommandWithArgs(updateLockfile: boolean): string[] {
		const resolvedCommand = resolveCommand(
			this.installName,
			updateLockfile ? "install" : "frozen",
			[],
		);

		if (resolvedCommand === null) {
			throw new Error("Cannot generate command");
		}
		const { command, args } = resolvedCommand;
		return [command, ...args];
	}
}

/**
 * Create a new package manager instance.
 */
export function detectPackageManager(cwd = process.cwd()): IPackageManager {
	const result = detectSync({
		cwd,
		onUnknown: (pm) => {
			throw new Error(`Unknown package manager: ${pm}`);
		},
	});

	if (result === null) {
		throw new Error(`Package manager could not be detected. Started looking at '${cwd}'.`);
	}

	return new PackageManager(result.name, result.agent);
}
