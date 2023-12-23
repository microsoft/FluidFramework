/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package, updatePackageJsonFile, PackageJson } from "@fluidframework/build-tools";
import { PackageCommand } from "../../BasePackageCommand";
import { ExtractorConfig } from "@microsoft/api-extractor";
import { CommandLogger } from "../../logging";
import path from "node:path/posix";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";

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
		"Updates which .d.ts file is referenced by the `types` or `exports` fields in package.json. This command is used during package publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.";

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

	private readonly packageList: PackageTypesList = {
		packagesNotUpdated: [],
		packagesUpdated: [],
	};

	protected async processPackage(pkg: Package): Promise<void> {
		const apiExtractorFoundConfig = ExtractorConfig.tryLoadForFolder({
			startingFolder: pkg.directory,
		});

		if (apiExtractorFoundConfig === undefined) {
			this.verbose(`No api-extractor config found for ${pkg.name}. Skipping.`);
			return;
		}

		const esmConfigFileName = path.join(pkg.directory, "api-extractor-esm.json");

		updatePackageJsonFile(pkg.directory, (json: PackageJson) => {
			// Handle the types/typings fields
			if (json.types !== undefined && json.typings !== undefined) {
				throw new Error(
					"Both 'types' and 'typings' fields are defined in the package.json. Only one should be used.",
				);
			}

			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined && json.exports === undefined) {
				throw new Error(
					"Neither 'types', 'typings', or 'exports' field is defined in the package.json.",
				);
			}

			/**
			 * When preparing the configuration object, paths referenced in the configuration are resolved and checked for
			 * existence, and an error is thrown if they are not found.
			 */
			const apiExtractorConfig = ExtractorConfig.prepare({
				...apiExtractorFoundConfig,
				ignoreMissingEntryPoint: !this.flags.checkFileExists,
			});

			const apiExtractorEsm = existsSync(esmConfigFileName)
				? ExtractorConfig.loadFileAndPrepare(esmConfigFileName)
				: undefined;

			assert(this.flags.types !== undefined, "--types flag must be provided.");

			const packageUpdated = updatePackageJsonTypes(
				pkg.directory,
				apiExtractorConfig,
				apiExtractorEsm,
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
 * Updates the types/exports field in package.json.
 * @returns true if the update was successful, false otherwise.
 */
// eslint-disable-next-line max-params
function updatePackageJsonTypes(
	directory: string,
	defaultConfig: ExtractorConfig,
	esmConfig: ExtractorConfig | undefined,
	dtsKind: DtsKind,
	json: PackageJson,
	log: CommandLogger,
): boolean {
	try {
		// If there's a typings field, delete it - we're replacing it.
		delete json.typings;

		writeTypes(json, "cjs", path.relative(directory, getPathsToTypes(defaultConfig, dtsKind)));

		if (esmConfig !== undefined) {
			writeTypes(json, "esm", path.relative(directory, getPathsToTypes(esmConfig, dtsKind)));
		}
		return true;
	} catch (error: unknown) {
		log.errorLog(error as Error);
	}
	return false;
}

function getPathsToTypes(config: ExtractorConfig, dtsType: DtsKind): string {
	switch (dtsType) {
		case "alpha": {
			return config.alphaTrimmedFilePath;
		}
		case "beta": {
			return config.betaTrimmedFilePath;
		}
		case "public": {
			return config.publicTrimmedFilePath;
		}
		case "untrimmed": {
			return config.untrimmedFilePath;
		}
		default: {
			throw new Error(`${dtsType} is not a valid value.`);
		}
	}
}

/**
 * Normalizes a relative path value so it has a leading './'
 *
 * @remarks
 *
 * Does not work with absolute paths.
 */
function normalizePathField(pathIn: string): string {
	if (pathIn === "" || pathIn === undefined) {
		throw new Error(`Invalid path!`);
	}
	if (pathIn.startsWith("./")) {
		return pathIn;
	}
	return `./${pathIn}`;
}

function writeTypes(json: PackageJson, moduleKind: "cjs" | "esm", typesPath: string): void {
	if (moduleKind === "cjs" && json.types !== undefined) {
		json.types = typesPath;
	}
	if (json.exports === undefined) {
		return;
	}
	// The PackageJson.Exports type complains that "." is not a valid indexer, so it's casted to any to
	// work around.
	/* eslint-disable @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment */
	const rootExport = (json.exports as any)["."];
	if (rootExport?.types !== undefined) {
		rootExport.types = normalizePathField(typesPath);
	}

	if (moduleKind === "cjs") {
		if (rootExport?.types !== undefined) {
			rootExport.types = normalizePathField(typesPath);
		} else if (rootExport?.require !== undefined) {
			rootExport.require.types = normalizePathField(typesPath);
		} else if (rootExport?.default !== undefined) {
			rootExport.default.types = normalizePathField(typesPath);
		}
		return;
	}

	if (moduleKind === "esm" && rootExport?.import !== undefined) {
		rootExport.import.types = normalizePathField(typesPath);
	}
	/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-assignment */
}
