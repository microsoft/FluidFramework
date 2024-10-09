/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ReleaseGroupDefinition, matchesReleaseGroupDefinition } from "./config.js";
import type { IPackage, IReleaseGroup, IWorkspace, ReleaseGroupName } from "./types.js";

export class ReleaseGroup implements IReleaseGroup {
	public readonly name: ReleaseGroupName;
	public readonly adoPipelineUrl: string | undefined;
	public constructor(
		name: string,
		releaseGroupDefinition: ReleaseGroupDefinition,
		public workspace: IWorkspace,
		public readonly rootPackage?: IPackage,
	) {
		this.name = name as ReleaseGroupName;
		this.adoPipelineUrl = releaseGroupDefinition.adoPipelineUrl;
		this.packages = workspace.packages
			.filter((pkg) => matchesReleaseGroupDefinition(pkg, releaseGroupDefinition))
			.map((pkg) => {
				// update the release group in the package object so we have an easy way to get from packages to release groups
				pkg.releaseGroup = this.name;
				return pkg;
			});

		if (releaseGroupDefinition.rootPackageName !== undefined) {
			// Find the root package in the set of release group packages
			const releaseGroupRoot = this.packages.find(
				(pkg) => pkg.name === releaseGroupDefinition.rootPackageName,
			);
			if (releaseGroupRoot === undefined) {
				throw new Error(
					`Could not find release group root package '${releaseGroupDefinition.rootPackageName}' in release group '${this.name}'`,
				);
			}
			releaseGroupRoot.isReleaseGroupRoot = true;
		}
	}

	public readonly packages: IPackage[];

	public get version(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.packages[0]!.version;
	}
	public get rgPackages(): IPackage[] {
		return this.packages;
	}

	public toString(): string {
		return `${this.name} (RELEASE GROUP)`;
	}

	public reload(): void {
		for (const pkg of this.packages) {
			pkg.reload();
		}
	}
}
