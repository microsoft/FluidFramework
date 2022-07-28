/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import path from "path";
import { existsSync, copySync, readJSONSync } from "fs-extra";
import { Flags } from '@oclif/core';
import { BaseCommand } from "../../base";

export default class BundleAnalysesCollect extends BaseCommand {
  static description = `Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption`;

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    lernaOutput: Flags.string({
        description: "Lerna Output",
        default: `npx lerna list --all --json`,
        required: true,
    }),
    ...super.flags,
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(BundleAnalysesCollect);

    // The smallest asset size that we deems to be correct. Adjust if we are testing for assets that are smaller.
    const smallestAssetSize = 100;

    if (!Array.isArray(flags.lernaOutput)) {
        this.error("failed to get package information");
    }

    // Check each package location for a bundleAnalysis folder
    // and copy it to a central location
    let hasSmallAssetError = false;
    const analysesDestPath = path.join(process.cwd(), "artifacts/bundleAnalysis");

    // eslint-disable-next-line unicorn/no-array-for-each
    flags.lernaOutput.forEach((pkg: { name: string, location: string }) => {
        if (pkg.location === undefined) {
            this.exit(-1);
            this.error("missing location in lerna package entry");
        }

        const packageAnalysisPath = path.join(pkg.location, "bundleAnalysis");
        if (existsSync(packageAnalysisPath)) {
            this.log(`found bundleAnalysis for ${pkg.name}`);

            // Check if we successfully generated any assets
            const reportPath = path.join(packageAnalysisPath, "report.json");
            if (!existsSync(reportPath)) {
                this.error(`${reportPath} is missing, cannot verify bundel analysis correctness`);
            }

            const report = readJSONSync(reportPath);
            if (report.assets?.length !== undefined) {
                this.error(`${reportPath} doesn't have any assets info`);
            }

            for (const asset of report.assets) {

                if (asset.chunkNames?.length !== undefined) {
                    // Assets without chunkNAmes are not code files
                    continue;
                }

                if (asset.size < smallestAssetSize) {
                    this.warn(`${pkg.name}: asset ${asset.name} (${asset.size}) is too small`);
                    hasSmallAssetError = true;
                }

            }

            copySync(packageAnalysisPath, path.join(analysesDestPath, pkg.name), { recursive: true });
        }
    });

    if (hasSmallAssetError) {
        this.error(`Found assets are too small (<${smallestAssetSize} bytes). Webpack bundle analysis is probably not correct.`);
    }
  }
}
