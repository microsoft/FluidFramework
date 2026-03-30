/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import * as path from "node:path";

import { defaultLogger } from "../common/logging";
import type { PackageJson } from "../common/npmPackage";
import type {
	BuildInfraPackage,
	BuildInfraPackageDependency,
	BuildInfraReleaseGroup,
} from "./buildInfraTypes";

const { errorLog: error } = defaultLogger;

/**
 * Wraps a build-infrastructure IPackage with fluid-build-specific state such as matching
 * and lock file lookup.
 */
export class FluidBuildPackage {
	private _matched = false;

	public constructor(
		/**
		 * The underlying IPackage from build-infrastructure.
		 */
		public readonly inner: BuildInfraPackage,

		/**
		 * The release group this package belongs to, if any.
		 * Undefined for independent packages (packages not in a release group).
		 */
		public readonly releaseGroupObj: BuildInfraReleaseGroup | undefined,
	) {}

	// --- Delegated properties ---

	public get name(): string {
		return this.inner.name;
	}

	public get nameColored(): string {
		return this.inner.nameColored;
	}

	public get directory(): string {
		return this.inner.directory;
	}

	public get version(): string {
		return this.inner.version;
	}

	public get isReleaseGroupRoot(): boolean {
		return this.inner.isReleaseGroupRoot;
	}

	public get releaseGroup(): string {
		return this.inner.releaseGroup;
	}

	public get packageJsonFilePath(): string {
		return this.inner.packageJsonFilePath;
	}

	public get packageManager(): string {
		return this.inner.packageManager.name;
	}

	/**
	 * The package.json contents, cast to build-tools' PackageJson type which includes the
	 * `fluidBuild` field. This cast is safe because the underlying JSON object contains all
	 * fields regardless of the TypeScript type used by build-infrastructure.
	 */
	public get packageJson(): PackageJson {
		return this.inner.packageJson as unknown as PackageJson;
	}

	public get combinedDependencies(): Generator<BuildInfraPackageDependency, void> {
		return this.inner.combinedDependencies;
	}

	public getScript(name: string): string | undefined {
		return this.inner.getScript(name);
	}

	// --- Build-specific state ---

	public get matched(): boolean {
		return this._matched;
	}

	public setMatched(): void {
		this._matched = true;
	}

	/**
	 * Get the full path to the lock file for this package.
	 * Looks in the workspace root directory (or the package directory for independent packages).
	 */
	public getLockFilePath(): string | undefined {
		const directory = this.releaseGroupObj
			? this.releaseGroupObj.workspace.directory
			: this.directory;
		const lockFileNames = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"];
		for (const lockFileName of lockFileNames) {
			const full = path.join(directory, lockFileName);
			if (existsSync(full)) {
				return full;
			}
		}
		return undefined;
	}

	/**
	 * Check if this package's dependencies are installed.
	 *
	 * @param print - If true, log errors for missing dependencies.
	 * @returns true if all dependencies are installed, false otherwise.
	 */
	public async checkInstall(print: boolean = true): Promise<boolean> {
		const result = await this.inner.checkInstall();
		if (result === true) {
			return true;
		}
		if (print) {
			for (const message of result) {
				error(`${this.nameColored}: ${message}`);
			}
		}
		return false;
	}
}
