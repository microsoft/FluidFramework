/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package, updatePackageJsonFile, PackageJson } from "@fluidframework/build-tools";
import { PackageCommand } from "../../BasePackageCommand";
import { ExtractorConfig } from "@microsoft/api-extractor";
import { CommandLogger } from "../../logging";
import path from "node:path";
import { strict as assert } from "node:assert";

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

const knownDtsKinds = ["alpha", "beta", "public", "untrimmed"] as const;

type DtsKind = typeof knownDtsKinds[number];

function isDtsKind(str: string | undefined): str is DtsKind {
	return str === undefined ? false : knownDtsKinds.includes(str as any);
}

export default class SetReleaseTagPublishingCommand extends PackageCommand<
	typeof SetReleaseTagPublishingCommand
> {
	static readonly description =
		"Updates the .d.ts types that are included in the `types` field in package.json. This command is intended to be used in CI only.";

	static readonly enableJsonFlag = true;

	static readonly flags = {
		types: Flags.custom<DtsKind>({
			description: "Which .d.ts types to include in the published package.",
			required: true,
			parse: async (input) => {
				if (isDtsKind(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...PackageCommand.flags,
	};

	private readonly packageList: PackageTypesList = {
		packagesNotUpdated: [],
		packagesUpdated: [],
	};

	protected async processPackage(pkg: Package): Promise<void> {
		let packageUpdated: boolean = false;

		updatePackageJsonFile(pkg.directory, (json) => {
			if (json.types !== undefined && json.typings !== undefined) {
				throw new Error(
					"Both 'types' and 'typings' fields are defined in the package.json. Only one should be used.",
				);
			}

			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined) {
				this.verbose("Neither 'types' nor 'typings' field is defined in the package.json.");
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
			assert(this.flags.types !== undefined, "--types flag must be provided.");

			packageUpdated = updatePackageJsonTypes(
				pkg.directory,
				extractorConfig,
				this.flags.types,
				json,
				this.logger,
			);

			const updatedPackageList = packageUpdated
				? this.packageList.packagesUpdated.push(pkg.name)
				: this.packageList.packagesNotUpdated.push(pkg.name);
			return updatedPackageList;
		});
	}

	public async run(): Promise<PackageTypesList> {
		// Calls processPackage on all packages.
		await super.run();

		if (this.packageList.packagesUpdated.length === 0) {
			this.log(`No updates in package.json for ${this.flags.types} release tag`);
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
function updatePackageJsonTypes(
	directory: string,
	extractorConfig: ExtractorConfig,
	dTsType: DtsKind,
	json: PackageJson,
	log: CommandLogger,
): boolean {
	let packageUpdated = false;
	try {
		if (extractorConfig.rollupEnabled === true) {
			packageUpdated = true;
			switch (dTsType) {
				case "alpha": {
					if (extractorConfig.alphaTrimmedFilePath === "") {
						packageUpdated = false;
						throw new Error("alphaTrimmedFilePath is empty");
					}

					json.types = path.relative(directory, extractorConfig.alphaTrimmedFilePath);
					break;
				}

				case "beta": {
					json.types = path.relative(directory, extractorConfig.betaTrimmedFilePath);
					break;
				}

				case "public": {
					json.types = path.relative(directory, extractorConfig.publicTrimmedFilePath);
					break;
				}

				case "untrimmed": {
					json.types = path.relative(directory, extractorConfig.untrimmedFilePath);
					break;
				}

				default: {
					log.errorLog(`${dTsType} is not a valid value.`);
				}
			}
		}
	} catch {
		log.verbose(`Unable to update types: ${JSON.stringify(extractorConfig)}`);
	}
	return packageUpdated;
}
