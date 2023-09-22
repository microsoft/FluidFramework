/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import path from "node:path";
import { PackageCommand } from "../BasePackageCommand";
import * as fs from "fs";

/**
 * A enum defining the four release types
 */
type UpdatePackageJsonType = "alpha" | "beta" | "public";

/**
 * A typeguard to check if a string is a {@link UpdatePackageJsonEnum}.
 */
function isUpdatePackageJsonTypes(type: string): type is UpdatePackageJsonType {
	return type === "alpha" || type === "beta" || type === "public";
}

export default class SetReleaseTagPublishingCommand extends PackageCommand<
	typeof SetReleaseTagPublishingCommand
> {
	static readonly description =
		"Updates the types in package.json based on the release flag. This command is intended for use in publishing pipelines and may not be intended for regular developer use.";

	static flags = {
		types: Flags.custom<UpdatePackageJsonType>({
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

	private readonly packageTypesList: string[] = [];

	protected async processPackage(pkg: Package): Promise<void> {
		// Define paths to api-extractor.json
		const apiExtractorConfigFilePath = path.join(pkg.directory, "api-extractor.json");

		// Check if api-extractor.json exists in the package directory
		const apiExtractorConfigExists = fs.existsSync(apiExtractorConfigFilePath);

		updatePackageJsonFile(pkg.directory, (json) => {
			const types: string | undefined = json.types;

			if (types === undefined) {
				return;
			}

			const [typesFolder] = types.split("/");

			const includesAlphaBeta: boolean = types.includes("alpha") || types.includes("beta");

			if (apiExtractorConfigExists) {
				// Read the content of api-extractor.json
				const apiExtractorConfig: string = fs.readFileSync(
					apiExtractorConfigFilePath,
					"utf-8",
				);

				if (this.flags.types !== "public" && apiExtractorConfig.includes("dtsRollup")) {
					const config: boolean = apiExtractorConfig.includes(
						`${this.flags.types}TrimmedFilePath`,
					);

					if (config) {
						json.types = `${typesFolder}/${pkg.nameUnscoped}-${this.flags.types}.d.ts`;
						this.packageTypesList.push(pkg.name);
					}
				} else if (includesAlphaBeta) {
					json.types = `${typesFolder}/index.d.ts`;
					this.packageTypesList.push(pkg.name);
				}
			}
		});
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages.
		await super.run();

		const flags = this.flags;

		if (this.packageTypesList.length === 0) {
			this.log(`No updates in package.json for ${flags.types} release`);
			return;
		}

		this.log(
			`package.json types field updated for the following packages to release type ${
				flags.types
			}: ${JSON.stringify(this.packageTypesList)}`,
		);
	}
}
