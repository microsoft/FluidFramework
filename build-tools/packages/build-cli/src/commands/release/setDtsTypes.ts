/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import { PackageCommand } from "../../BasePackageCommand";
// eslint-disable-next-line node/no-missing-import
import type { PackageJson } from "type-fest";
import { ExtractorConfig } from "@microsoft/api-extractor";
import { CommandLogger } from "../../logging";
import path from "node:path";

/**
 * Represents a list of package categorized into two arrays
 */
interface PackageTypesList {
	/**
	 * An array of strings containing package names that have been updated.
	 */
	packagesUpdated: string[];
	/**
	 * An array of strings containing package names that have not been updated.
	 */
	packagesNotUpdated: string[];
}

/**
 * Represents a configuration object for updating a package.
 */
interface ReleaseTagConfig {
	/**
	 * The package to be updated.
	 */
	pkg: Package;
	/**
	 * ExtractorConfig represents api-extractor.json config file.
	 */
	extractorConfig: ExtractorConfig;
	/**
	 * The type of release for the package (e.g., "alpha", "beta", "public", "default").
	 */
	releaseType: ReleaseTag;
	/**
	 * The JSON data for the package.
	 */
	json: PackageJson;
}

const knownReleaseTag = ["alpha", "beta", "public", "default"] as const;

type ReleaseTag = typeof knownReleaseTag[number];

function isReleaseTag(str: string | undefined): str is ReleaseTag {
	return str === undefined ? false : knownReleaseTag.includes(str as any);
}

export default class SetReleaseTagPublishingCommand extends PackageCommand<
	typeof SetReleaseTagPublishingCommand
> {
	static readonly description =
		"Updates the .d.ts types that are included in the `types` field in package.json. This command is intended to be used in CI only.";

	static readonly enableJsonFlag = true;

	static readonly flags = {
		types: Flags.custom<ReleaseTag>({
			description: "Which .d.ts types to include in the published package.",
			required: true,
			parse: async (input) => {
				if (isReleaseTag(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...PackageCommand.flags,
	};

	private packageList!: PackageTypesList;

	// Override the init method to initialize packageList
	public async init() {
		await super.init();
		this.packageList = {
			packagesNotUpdated: [],
			packagesUpdated: [],
		};
	}

	protected async processPackage(pkg: Package): Promise<void> {
		let packageUpdate: boolean = false;

		updatePackageJsonFile(pkg.directory, (json) => {
			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined) {
				return;
			}

			const configOptions = ExtractorConfig.tryLoadForFolder({
				startingFolder: pkg.directory,
			});
			if (configOptions === undefined) {
				this.verbose(`No api-extractor config found for ${pkg.name}. Skipping.`);
				return;
			}
			const extractorConfig = ExtractorConfig.prepare(configOptions);

			const config: ReleaseTagConfig = {
				pkg,
				extractorConfig,
				releaseType: this.flags.types as ReleaseTag,
				json,
			};

			packageUpdate = updatePackageJsonTypes(config, this.logger);

			updatePackageLists(this.packageList, packageUpdate, pkg);
		});
	}

	public async run(): Promise<PackageTypesList> {
		// Calls processPackage on all packages.
		await super.run();

		const flags = this.flags;

		if (this.packageList.packagesUpdated.length === 0) {
			this.log(`No updates in package.json for ${flags.types} release tag`);
		}

		return this.packageList;
	}
}

/**
 * Updates the types/typing field in package.json.
 * @param config - An interface specifying the package, extractor config, release type, JSON data
 * @param log - The logger used for logging verbose information.
 * @returns true if the update was successful, false otherwise.
 */
function updatePackageJsonTypes(config: ReleaseTagConfig, log: CommandLogger): boolean {
	let packageUpdate = false;
	try {
		if (config.extractorConfig.rollupEnabled === true) {
			switch (config.releaseType) {
				case "alpha": {
					config.json.types = path.relative(
						config.pkg.directory,
						config.extractorConfig.alphaTrimmedFilePath,
					);
					packageUpdate = true;
					break;
				}

				case "beta": {
					config.json.types = path.relative(
						config.pkg.directory,
						config.extractorConfig.betaTrimmedFilePath,
					);
					packageUpdate = true;
					break;
				}

				case "public": {
					config.json.types = path.relative(
						config.pkg.directory,
						config.extractorConfig.publicTrimmedFilePath,
					);
					packageUpdate = true;
					break;
				}

				default: {
					config.json.types = path.relative(
						config.pkg.directory,
						config.extractorConfig.untrimmedFilePath,
					);
					packageUpdate = true;
					break;
				}
			}
		}
	} catch {
		log.verbose(`Unable to update types: ${JSON.stringify(config.extractorConfig)}`);
	}
	return packageUpdate;
}

/**
 * Updates a package types list based on whether a package was updated or not.
 *
 * @param packageList - The package types list to be updated.
 * @param packageUpdate - A boolean indicating whether the package was updated.
 * @param pkg - The package being processed.
 * @returns The updated package types list.
 */
function updatePackageLists(
	packageList: PackageTypesList,
	packageUpdate: boolean,
	pkg: Package,
): PackageTypesList {
	if (packageUpdate) {
		packageList.packagesUpdated.push(pkg.name);
	} else {
		packageList.packagesNotUpdated.push(pkg.name);
	}
	return packageList;
}
