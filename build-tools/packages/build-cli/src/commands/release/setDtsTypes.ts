/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags, Config } from "@oclif/core";
import { Package, updatePackageJsonFile } from "@fluidframework/build-tools";
import path from "node:path";
import { PackageCommand } from "../../BasePackageCommand";
// eslint-disable-next-line node/no-missing-import
import type { PackageJson } from "type-fest";
import { ExtractorConfig } from "@microsoft/api-extractor";
import { CommandLogger } from "../../logging";

interface PackageTypesList {
	packagesUpdated: string[];
	packagesNotUpdated: string[];
}

interface UpdateConfig {
	pkg: Package;
	releaseType: string;
	json: PackageJson;
	typesFolder: string;
	includesAlphaBeta: boolean;
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

		updatePackageJsonFile(pkg.directory, (json) => {
			const types: string | undefined = json.types ?? json.typings;

			if (types === undefined) {
				return;
			}

			const [typesFolder] = types.split("/");
			const includesAlphaBeta: boolean = types.includes("alpha") || types.includes("beta");

			const config: UpdateConfig = {
				pkg,
				releaseType: this.flags.types as ReleaseTag,
				json,
				typesFolder,
				includesAlphaBeta,
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

function updatePackageJsonTypes(config: UpdateConfig, log: CommandLogger): boolean {
	const apiExtractorConfigFilePath = path.join(config.pkg.directory, "api-extractor.json");
	let loadFile;
	try {
		loadFile = ExtractorConfig.loadFile(apiExtractorConfigFilePath);
		const dtsRollupEnabled = loadFile.dtsRollup?.enabled;
		if (dtsRollupEnabled !== undefined && dtsRollupEnabled) {
			log.log(`Config exists: ${JSON.stringify(config.pkg.directory)}`);

			const alpha = loadFile.dtsRollup?.alphaTrimmedFilePath;
			const beta = loadFile.dtsRollup?.betaTrimmedFilePath;

			if (config.releaseType === "alpha" && alpha !== undefined) {
				config.json.types = `${config.typesFolder}/${config.pkg.nameUnscoped}-alpha.d.ts`;
				return true;
			}

			if (config.releaseType === "beta" && beta !== undefined) {
				config.json.types = `${config.typesFolder}/${config.pkg.nameUnscoped}-beta.d.ts`;
				return true;
			}

			if (config.releaseType === "public" && config.includesAlphaBeta) {
				config.json.types = `${config.typesFolder}/index.d.ts`;
				return true;
			}
		}
	} catch {
		if (loadFile === undefined) {
			log.log(`Config not exists: ${JSON.stringify(config.pkg.directory)}`);
		}
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
