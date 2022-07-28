/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execSync } from "child_process";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base";

export default class BundleAnalysesRun extends BaseCommand {
    static description = `Run to report the bundle analysis. Donot run Danger directly at the root of the
    repo as this better isolates its usage and dependencies`;

    static flags = {
        ...super.flags,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(BundleAnalysesRun);

        try {
            execSync(`npx danger ci -d ${__dirname}/dangerfile.js`, { stdio: "inherit" });
        } catch (error_: unknown) {
            this.exit(-1);
            this.error(error_ as string);
        }
    }
}
