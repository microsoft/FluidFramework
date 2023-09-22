/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags, Config } from "@oclif/core";
import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import path from "node:path";
import { PackageCommand } from "../../BasePackageCommand";
import * as fs from "fs";

interface PackageTypesList {
	packagesUpdated: string[];
	packagesNotUpdated: string[];
}

const knownReleaseTag = ["alpha", "beta", "public"] as const;

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
			parse: async (input) => {
				if (isReleaseTag(input)) {
					return input;
				}
				throw new Error(`Invalid release type: ${input}`);
			},
		})(),
		...PackageCommand.flags,
	};

	private readonly packageList: PackageTypesList;

	constructor(argv: string[], config: Config) {
		super(argv, config);
		this.packageList = {
			packagesNotUpdated: [],
			packagesUpdated: [],
		};
	}

	protected async processPackage(pkg: Package): Promise<void> {
		let packageUpdate: boolean = false;
		// Define paths to api-extractor.json
		const apiExtractorConfigFilePath = path.join(pkg.directory, "api-extractor.json");

		// Check if api-extractor.json exists in the package directory
		const apiExtractorConfigExists = fs.existsSync(apiExtractorConfigFilePath);
		updatePackageJsonFile(pkg.directory, (json) => {
			const types: string | undefined = json.types ?? json.typings;

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
						packageUpdate = true;
					}
				} else if (includesAlphaBeta) {
					json.types = `${typesFolder}/index.d.ts`;
					packageUpdate = true;
				}

				if (packageUpdate) {
					this.packageList.packagesUpdated.push(pkg.name);
				} else {
					this.packageList.packagesNotUpdated.push(pkg.name);
				}
			}
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
