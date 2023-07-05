/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package } from "@fluidframework/build-tools";
import path from "node:path";

import { PackageCommand } from "../../BasePackageCommand";

export default class CheckBuildVersionCommand extends PackageCommand<
	typeof CheckBuildVersionCommand
> {
	static description = `Checks that all packages have the same version set in package.json. The packages checked can be filtered by standard criteria. THIS COMMAND IS INTENDED FOR USE IN FLUID FRAMEWORK CI PIPELINES ONLY.`;

	static flags = {
		version: Flags.string({
			description: "The version against which to check all the packages.",
			exclusive: ["path"],
		}),
		path: Flags.directory({
			description:
				"Path to a directory containing a package. The version will be loaded from the package.json in this directory.",
			exists: true,
			exclusive: ["version"],
		}),
		fix: Flags.boolean({
			description: "Fix invalid versions in the package.json file.",
			default: false,
		}),
		...PackageCommand.flags,
	};

	private versionToCheck: string | undefined;

	public async init(): Promise<void> {
		await super.init();
		if (this.flags.version === undefined) {
			if (this.flags.path === undefined) {
				this.error("Either version or path must be specified.");
			}
			const pkg = new Package(path.join(this.flags.path, "package.json"), "none");
			this.versionToCheck = pkg.version;
		} else {
			this.versionToCheck = this.flags.version;
		}
	}

	private readonly invalidVersions: Package[] = [];
	protected async processPackage(pkg: Package): Promise<void> {
		if (pkg.version !== this.versionToCheck) {
			this.invalidVersions.push(pkg);
		}
	}

	public async run(): Promise<void> {
		if (this.versionToCheck === undefined) {
			this.error("Version to check is undefined.");
		}

		// Calls processPackage on all packages.
		await super.run();

		if (this.invalidVersions.length > 0) {
			if (this.flags.fix) {
				const saveP: Promise<void>[] = [];
				for (const pkg of this.invalidVersions) {
					pkg.packageJson.version = this.versionToCheck;
					saveP.push(pkg.savePackageJson());
				}
				await Promise.all(saveP);

				this.log(
					`Updated versions of the following packages: ${this.invalidVersions
						.map((pkg) => pkg.name)
						.join(", ")}`,
				);
			} else {
				this.error(
					`Some packages have invalid versions. Use '--fix' to update them automatically: ${this.invalidVersions
						.map((pkg) => pkg.name)
						.join(", ")}`,
				);
			}
		}
	}
}
