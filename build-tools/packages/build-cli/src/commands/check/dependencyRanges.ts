/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import { Package } from "@fluidframework/build-tools";
import { StringBuilder } from "@rushstack/node-core-library";

import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";

export default class CheckDependencyRangesCommand extends PackageCommand<
	typeof CheckDependencyRangesCommand
> {
	static readonly description =
		`Checks that no packages have dependency ranges on Fluid internal versions using caret (^) or tilde (~) dependencies. Such ranges are invalid and will include unexpected versions. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.`;

	protected defaultSelection = "dir" as PackageSelectionDefault;

	private readonly invalidRanges: Map<Package, string[]> = new Map();
	protected async processPackage(pkg: Package): Promise<void> {
		this.verbose(`Checking ${pkg.name}`);
		const invalidDepNames: string[] = [];
		for (const { name: depName, version: depRange } of pkg.combinedDependencies) {
			if (depRange.startsWith("^") || depRange.startsWith("~")) {
				const version = depRange.slice(1);
				if (isInternalVersionScheme(version, /* allowPrereleases */ true)) {
					invalidDepNames.push(depName);
				}
			}
		}

		if (invalidDepNames.length > 0) {
			this.invalidRanges.set(pkg, invalidDepNames);
		}
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages.
		await super.run();

		if (this.invalidRanges.size > 0) {
			const sb = new StringBuilder();
			sb.append(
				"Some packages have dependency ranges on Fluid internal versions using caret or tilde dependencies:",
			);
			for (const [pkg, deps] of this.invalidRanges.entries()) {
				sb.append(`\n${pkg.name}:\n\t`);
				sb.append(deps.join(", "));
			}
			this.error(sb.toString(), { exit: 100 });
		}
	}
}
