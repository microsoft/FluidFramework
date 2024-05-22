/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { Flags } from "@oclif/core";
import { copySync, readJson } from "fs-extra/esm";

import { BaseCommand } from "../../library/index.js";
import { PnpmListEntry, pnpmList } from "../../pnpm.js";

export default class GenerateBundlestats extends BaseCommand<typeof GenerateBundlestats> {
	static readonly description =
		`Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption`;

	static readonly flags = {
		packageMetadataPath: Flags.file({
			description:
				"A path to a file containing JSON formatted package metadata. Used for testing. When not provided, the output of `pnpm -r list --depth -1 --json` is used.",
			required: false,
			hidden: true,
		}),
		smallestAssetSize: Flags.integer({
			description: `The smallest asset size in bytes to consider correct. Adjust when testing for assets that are smaller.`,
			default: 100,
			required: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;
		const pkgList = await (flags.packageMetadataPath === undefined
			? pnpmList(process.cwd())
			: (readJson(flags.packageMetadataPath) as Promise<PnpmListEntry[]>));

		if (!Array.isArray(pkgList) || pkgList.length === 0) {
			this.error("failed to get package information");
		}

		// Check each package location for a bundleAnalysis folder
		// and copy it to a central location
		let hasSmallAssetError = false;
		const analysesDestPath = path.join(process.cwd(), "artifacts/bundleAnalysis");

		for (const pkg of pkgList) {
			if (pkg.path === undefined) {
				this.error(`Missing path in pnpm list results for ${pkg.name}`, { exit: -1 });
			}

			const packageAnalysisPath = path.join(pkg.path, "bundleAnalysis");
			if (existsSync(packageAnalysisPath)) {
				this.log(`found bundleAnalysis for ${pkg.name}`);

				// Check if we successfully generated any assets
				const reportPath = path.join(packageAnalysisPath, "report.json");
				if (!existsSync(reportPath)) {
					this.error(`${reportPath} is missing; bundle analysis may not be accurate.`);
				}

				/* eslint-disable @typescript-eslint/no-unsafe-member-access */
				// eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-unsafe-assignment
				const report = await readJson(reportPath);
				if (report.assets?.length === undefined || report.assets?.length === 0) {
					this.error(`${reportPath} doesn't have any assets info`);
				}

				for (const asset of report.assets) {
					if (asset.chunkNames?.length !== undefined) {
						// Assets without chunkNames are not code files
						continue;
					}

					if (asset.size < flags.smallestAssetSize) {
						this.warning(`${pkg.name}: asset ${asset.name} (${asset.size}) is too small`);
						hasSmallAssetError = true;
					}
				}
				/* eslint-enable @typescript-eslint/no-unsafe-member-access */

				copySync(packageAnalysisPath, path.join(analysesDestPath, pkg.name));
			}
		}

		if (hasSmallAssetError) {
			this.error(
				`Found assets that are too small (<${flags.smallestAssetSize} bytes). Webpack bundle analysis may not be accurate.`,
			);
		}
	}
}
