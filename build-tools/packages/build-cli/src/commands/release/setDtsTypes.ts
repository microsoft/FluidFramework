/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags, Config } from "@oclif/core";
import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import path from "node:path";
import { PackageCommand } from "../../BasePackageCommand";
import * as fs from "fs";
// eslint-disable-next-line node/no-missing-import
import type { PackageJson } from "type-fest";

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
			required: true,
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

		const apiExtractorConfigExists = checkApiExtractorConfigExists(pkg);

		updatePackageJsonFile(pkg.directory, (json) => {
			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined) {
				return;
			}

			const [typesFolder] = types.split("/");
			const includesAlphaBeta: boolean = types.includes("alpha") || types.includes("beta");

			if (apiExtractorConfigExists) {
				packageUpdate = handleApiExtractorConfig(
					this.flags.types as ReleaseTag,
					pkg,
					json,
					typesFolder,
					includesAlphaBeta,
				);
			}

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

function checkApiExtractorConfigExists(pkg: Package): boolean {
	const apiExtractorConfigFilePath = path.join(pkg.directory, "api-extractor.json");
	return fs.existsSync(apiExtractorConfigFilePath);
}

function handleApiExtractorConfig(
	releaseType: ReleaseTag,
	pkg: Package,
	json: PackageJson,
	typesFolder: string,
	includesAlphaBeta: boolean,
): boolean {
	const apiExtractorConfigFilePath = path.join(pkg.directory, "api-extractor.json");
	const apiExtractorConfig: string = fs.readFileSync(apiExtractorConfigFilePath, "utf-8");

	if (releaseType !== "public" && apiExtractorConfig.includes("dtsRollup")) {
		const config: boolean = apiExtractorConfig.includes(`${releaseType}TrimmedFilePath`);

		if (config) {
			json.types = `${typesFolder}/${pkg.nameUnscoped}-${releaseType}.d.ts`;
			return true;
		}
	} else if (includesAlphaBeta) {
		json.types = `${typesFolder}/index.d.ts`;
		return true;
	}

	return false;
}

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
