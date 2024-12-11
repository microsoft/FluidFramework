/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { Package, PackageJson, updatePackageJsonFile } from "@fluidframework/build-tools";
import { ExtractorConfig } from "@microsoft/api-extractor";
import { Flags } from "@oclif/core";
import { PackageCommand } from "../../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../../flags.js";
import { CommandLogger } from "../../logging.js";

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

type DtsKind = (typeof knownDtsKinds)[number];

function isDtsKind(str: string | undefined): str is DtsKind {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
	return str === undefined ? false : knownDtsKinds.includes(str as any);
}

export default class SetReleaseTagPublishingCommand extends PackageCommand<
	typeof SetReleaseTagPublishingCommand
> {
	static readonly description =
		"Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.";

	// This command is deprecated and should no longer be used.
	static readonly state = "deprecated";
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
		checkFileExists: Flags.boolean({
			description: "Check if the file path exists",
			default: true,
			allowNo: true,
		}),
		...PackageCommand.flags,
	};

	protected defaultSelection = "dir" as PackageSelectionDefault;

	private readonly packageList: PackageTypesList = {
		packagesNotUpdated: [],
		packagesUpdated: [],
	};

	protected async processPackage(pkg: Package): Promise<void> {
		const configOptions = ExtractorConfig.tryLoadForFolder({
			startingFolder: pkg.directory,
		});

		if (configOptions === undefined) {
			this.verbose(`No api-extractor config found for ${pkg.name}. Skipping.`);
			return;
		}

		updatePackageJsonFile(pkg.directory, (json) => {
			if (json.types !== undefined && json.typings !== undefined) {
				throw new Error(
					"Both 'types' and 'typings' fields are defined in the package.json. Only one should be used.",
				);
			}

			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined) {
				throw new Error("Neither 'types' nor 'typings' field is defined in the package.json.");
			}

			/**
			 * When preparing the configuration object, folder and file paths referenced in the configuration are checked for existence,
			 * and an error is reported if they are not found.
			 */
			const extractorConfig = ExtractorConfig.prepare({
				...configOptions,
				ignoreMissingEntryPoint: !this.flags.checkFileExists,
			});
			assert(this.flags.types !== undefined, "--types flag must be provided.");

			const packageUpdated = updatePackageJsonTypes(
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
			this.errorLog(`No updates in package.json for ${this.flags.types} release tag`);
			this.exit(1);
		}

		return this.packageList;
	}
}

/**
 * Updates the types/typing field in package.json.
 * @returns true if the update was successful, false otherwise.
 */
function updatePackageJsonTypes(
	directory: string,
	extractorConfig: ExtractorConfig,
	dTsType: DtsKind,
	json: PackageJson,
	log: CommandLogger,
): boolean {
	try {
		if (extractorConfig.rollupEnabled === true) {
			let filePath = "";

			switch (dTsType) {
				case "alpha": {
					filePath = extractorConfig.alphaTrimmedFilePath;
					break;
				}
				case "beta": {
					filePath = extractorConfig.betaTrimmedFilePath;
					break;
				}
				case "public": {
					filePath = extractorConfig.publicTrimmedFilePath;
					break;
				}
				case "untrimmed": {
					filePath = extractorConfig.untrimmedFilePath;
					break;
				}
				default: {
					log.errorLog(`${dTsType} is not a valid value.`);
					break;
				}
			}

			if (filePath) {
				delete json.typings;
				json.types = path.relative(directory, filePath);
				return true;
			}
		}
	} catch {
		log.verbose(`Unable to update types: ${JSON.stringify(extractorConfig.projectFolder)}`);
	}
	return false;
}
