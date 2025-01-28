/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ReleaseGroupDefinition, matchesReleaseGroupDefinition } from "./config.js";
import type {
	IPackage,
	IReleaseGroup,
	IWorkspace,
	PackageName,
	ReleaseGroupName,
} from "./types.js";

/**
 * {@inheritDoc IReleaseGroup}
 */
export class ReleaseGroup implements IReleaseGroup {
	/**
	 * {@inheritDoc IReleaseGroup.name}
	 */
	public readonly name: ReleaseGroupName;

	/**
	 * {@inheritDoc IReleaseGroup.adoPipelineUrl}
	 */
	public readonly adoPipelineUrl: string | undefined;

	public constructor(
		name: string,
		releaseGroupDefinition: ReleaseGroupDefinition,

		/**
		 * {@inheritDoc IReleaseGroup.workspace}
		 */
		public workspace: IWorkspace,

		/**
		 * {@inheritDoc IReleaseGroup.rootPackage}
		 */
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

	/**
	 * {@inheritDoc IReleaseGroup.packages}
	 */
	public readonly packages: IPackage[];

	/**
	 * {@inheritDoc IReleaseGroup.version}
	 */
	public get version(): string {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.packages[0]!.version;
	}

	/**
	 * {@inheritDoc IReleaseGroup.releaseGroupDependencies}
	 */
	public get releaseGroupDependencies(): IReleaseGroup[] {
		const dependentReleaseGroups = new Set<IReleaseGroup>();
		const ignoredDependencies = new Set<PackageName>();
		const buildProject = this.workspace.buildProject;
		for (const pkg of this.packages) {
			for (const { name } of pkg.combinedDependencies) {
				if (ignoredDependencies.has(name)) {
					continue;
				}
				const depPackage = buildProject.packages.get(name);
				if (depPackage === undefined || depPackage.releaseGroup === this.name) {
					ignoredDependencies.add(name);
					continue;
				}

				const releaseGroup = buildProject.releaseGroups.get(depPackage.releaseGroup);
				if (releaseGroup === undefined) {
					throw new Error(
						`Cannot find release group "${depPackage.releaseGroup}" in workspace "${this.workspace}"`,
					);
				}
				dependentReleaseGroups.add(releaseGroup);
			}
		}

		return [...dependentReleaseGroups];
	}

	public toString(): string {
		return `${this.name} (RELEASE GROUP)`;
	}

	/**
	 * Synchronously reload all of the packages in the release group.
	 */
	public reload(): void {
		for (const pkg of this.packages) {
			pkg.reload();
		}
	}
}
