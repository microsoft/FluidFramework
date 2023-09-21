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
 * A type defining the four release types:
 *
 * - alpha
 *
 * - beta
 *
 * - public
 *
 * - internal
 */
type UpdatePackageJsonTypes = "alpha" | "beta" | "public" | "internal";

/**
 * A typeguard to check if a string is a {@link UpdatePackageJsonTypes}.
 */
function isUpdatePackageJsonTypes(type: string): type is UpdatePackageJsonTypes {
	return type === "alpha" || type === "internal" || type === "beta" || type === "public";
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
		types: Flags.custom<UpdatePackageJsonTypes>({
			description: "",
			default: "public",
			parse: async (input) => {
				if (isUpdatePackageJsonTypes(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...PackageCommand.flags,
	};

	private readonly packageJsonMap = new Map<string, string>();
	private readonly apiExtractorMap = new Map<string, string>();

	protected async processPackage(pkg: Package): Promise<void> {
		const packageJsonPath = path.join(pkg.directory, "package.json");
		const apiExtractorPath = path.join(pkg.directory, "api-extractor.json");

		// Read the content of the package.json file
		// eslint-disable-next-line unicorn/prefer-json-parse-buffer
		const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");

		const exists = fs.existsSync(apiExtractorPath);

		if (exists) {
			const apiExtractorContent = fs.readFileSync(apiExtractorPath, "utf-8");
			const roll = apiExtractorContent.includes("dtsRollup");
			const alpha = apiExtractorContent.includes("alphaTrimmedFilePath");
			const beta = apiExtractorContent.includes("betaTrimmedFilePath");
			if (roll) {
				this.log(`alpha: ${alpha}`);
				this.log(`beta: ${beta}`);
				this.log(pkg.name);
				this.log(pkg.directory);
			}
		}

		try {
			// Parse the JSON content to an object
			const packageJson = JSON.parse(packageJsonContent);

			// Check if the "types" field exists and return its value
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			const types = packageJson.types ? packageJson.types : packageJson.typings;
			this.packageJsonMap.set(pkg.name, types);
		} catch (error: unknown) {
			// Handle errors such as file not found or invalid JSON
			this.errorLog(`Error reading or parsing package.json: ${error} in ${pkg.directory}`);
		}
	}

	public async run(): Promise<void> {
		// Calls processPackage on all packages.
		await super.run();

		// const flags = this.flags;

		// for (const [key, value] of this.packageJsonMap) {
		// 	this.log(`Package json Key: ${key} and value: ${value}`);
		// }

		// for (const [key, value] of this.apiExtractorMap) {
		// 	this.log(`Api Extractor Key: ${key} and value: ${value}`);
		// }
	}
}
