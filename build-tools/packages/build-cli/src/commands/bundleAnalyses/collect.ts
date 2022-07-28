/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execSync } from "child_process";
import path from "path";
import { existsSync, copySync, readJSONSync } from "fs-extra";
import { Flags } from '@oclif/core';
import { BaseCommand } from "../../base";

export default class BundleAnalysesCollect extends BaseCommand {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({char: 'n', description: 'name to print'}),
    // flag with no value (-f, --force)
    force: Flags.boolean({char: 'f'}),
    ...super.flags,
  }

  static args = [{name: 'file'}]

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(BundleAnalysesCollect)

    // Get all the package locations
    const lernaOutput = JSON.parse(execSync("npx lerna list --all --json").toString());
    if (!Array.isArray(lernaOutput)) {
        this.error("failed to get package information");
    }

    // Check each package location for a bundleAnalysis folder
    // and copy it to a central location
    let hasSmallAssetError = false;
    const analysesDestPath = path.join(process.cwd(), "artifacts/bundleAnalysis");

    lernaOutput.forEach((pkg: { name: string, location: string }) => {
        if (pkg.location === undefined) {
            this.error("missing location in lerna package entry");
            // process.exit(-1);
        }

        const packageAnalysisPath = path.join(pkg.location, "bundleAnalysis");
        if (existsSync(packageAnalysisPath)) {
            console.log(`found bundleAnalysis for ${pkg.name}`);

            // Check if we successfully generated any assets
            const reportPath = path.join(packageAnalysisPath, "report.json");
            if (!existsSync(reportPath)) {
                throw new Error(`${reportPath} is missing, cannot verify bundel analysis correctness`);
            }

            const report = readJSONSync(reportPath);
            if (!report.assets?.length) {
                throw new Error(`${reportPath} doesn't have any assets info`);
            }

            for (const asset of report.assets) {

                if (!asset.chunkNames?.length) {
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
