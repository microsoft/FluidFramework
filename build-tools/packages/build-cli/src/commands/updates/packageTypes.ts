/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package } from "@fluidframework/build-tools";
import path from "node:path";
import { PackageCommand } from "../../BasePackageCommand";
import * as fs from "fs";

/**
 * A enum defining the four release types
 */
enum UpdatePackageJsonEnum {
	ALPHA = "alpha",
	BETA = "beta",
	DEFAULT = "public",
}

/**
 * A enum defining the api-extractor.json configs
 */
enum ApiExtractorConfig {
	DTSROLLUP = "dtsRollup",
	ALPHATRIMMED = "alphaTrimmedFilePath",
	BETATRIMMED = "betaTrimmedFilePath",
}

/**
 * A typeguard to check if a string is a {@link UpdatePackageJsonEnum}.
 */
function isUpdatePackageJsonTypes(type: string): type is UpdatePackageJsonEnum {
	return (
		type === UpdatePackageJsonEnum.ALPHA ||
		type === UpdatePackageJsonEnum.BETA ||
		type === UpdatePackageJsonEnum.DEFAULT
	);
}

export default class UpdatePackageTypesCommand extends PackageCommand<
	typeof UpdatePackageTypesCommand
> {
	static readonly description = "Updates the types in package.json based on the release flag";

	static flags = {
		path: Flags.directory({
			description: "Path to a directory containing a package.",
			exists: true,
			required: true,
		}),
		types: Flags.custom<UpdatePackageJsonEnum>({
			description:
				"The types flag is used to specify the type of release when updating a package.json file. It accepts a custom enumeration called UpdatePackageJsonEnum that defines different release types.",
			parse: async (input) => {
				if (isUpdatePackageJsonTypes(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...PackageCommand.flags,
	};

	private readonly packageTypesUpdated: string[] = [];

	protected async processPackage(pkg: Package): Promise<void> {
		// Define paths to package.json and api-extractor.json
		const packageJsonFilePath = path.join(pkg.directory, "package.json");
		const apiExtractorConfigFilePath = path.join(pkg.directory, "api-extractor.json");

		// Check if api-extractor.json exists in the package directory
		const apiExtractorConfigExists = fs.existsSync(apiExtractorConfigFilePath);

		try {
			// Read the content of the package.json file
			const packageJsonContent = fs.readFileSync(packageJsonFilePath, "utf-8");

			// Parse the JSON content to an object
			const packageJson = JSON.parse(packageJsonContent);

			if (apiExtractorConfigExists) {
				// Read the content of api-extractor.json
				const apiExtractorConfigContent = fs.readFileSync(
					apiExtractorConfigFilePath,
					"utf-8",
				);

				// Check if DTSROLLUP config exist in api-extractor.json
				const isDtsRollupEnabled = apiExtractorConfigContent.includes(
					ApiExtractorConfig.DTSROLLUP,
				);
				// Check if ALPHATRIMMED config exist in api-extractor.json
				const isAlphaTrimmed = apiExtractorConfigContent.includes(
					ApiExtractorConfig.ALPHATRIMMED,
				);
				// Check if BETATRIMMED config exist in api-extractor.json
				const isBetaTrimmed = apiExtractorConfigContent.includes(
					ApiExtractorConfig.BETATRIMMED,
				);

				if (isDtsRollupEnabled) {
					const packageJsonUpdatePath = path.join(pkg.directory, "package.json");

					// Extract the package name from the package directory
					const directorySegments: string[] = pkg.directory.split("/");
					const unscopedPackageName = directorySegments[directorySegments.length - 1];

					// Determine the value for the packageJson.types field based on flags
					if (this.flags.types === UpdatePackageJsonEnum.BETA && isBetaTrimmed) {
						packageJson.types = `dist/${unscopedPackageName}-beta.d.ts`;
						this.packageTypesUpdated.push(pkg.name);
					} else if (this.flags.types === UpdatePackageJsonEnum.ALPHA && isAlphaTrimmed) {
						packageJson.types = `dist/${unscopedPackageName}-alpha.d.ts`;
						this.packageTypesUpdated.push(pkg.name);
					} else if (this.flags.types === UpdatePackageJsonEnum.DEFAULT) {
						packageJson.types = "dist/index.d.ts";
						this.packageTypesUpdated.push(pkg.name);
					}

					// Serialize the updated package.json without modifying the formatting
					const updatedPackageJsonContent = JSON.stringify(
						packageJson,
						null,
						packageJsonContent.includes("\n") ? "\t" : 2,
					);

					// Add a newline character at the end
					const updatedPackageJsonWithNewline = `${updatedPackageJsonContent}\n`;

					// Write the updated package.json back to the file
					fs.writeFileSync(packageJsonUpdatePath, updatedPackageJsonWithNewline);
				}
			}
		} catch (error: unknown) {
			// Handle errors such as file not found or invalid JSON
			this.errorLog(`Error reading or parsing package.json: ${error} in ${pkg.directory}`);
		}
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages.
		await super.run();

		const flags = this.flags;

		if (this.packageTypesUpdated.length === 0) {
			this.log(`No updates in package.json`);
			return;
		}

		this.log(
			`package.json types field updated for the following packages to release type ${
				flags.types
			}: ${JSON.stringify(this.packageTypesUpdated)}`,
		);
	}
}
