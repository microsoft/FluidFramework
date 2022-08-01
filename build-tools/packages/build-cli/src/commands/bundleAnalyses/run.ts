/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execSync } from "child_process";
import { Flags } from "@oclif/core";
import { dangerfile } from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

export default class BundleAnalysesRun extends BaseCommand<typeof BundleAnalysesRun.flags> {
    static description = `Run to report the bundle analysis. Do not run Danger directly at the root of the
    repo as this better isolates its usage and dependencies`;

    static flags = {
        ...BaseCommand.flags,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(BundleAnalysesRun);

        try {
            execSync(`npx danger ci -d ${dangerfile}`, { stdio: "inherit" });
        } catch (error_: unknown) {
            this.exit(-1);
            this.error(error_ as string);
        }
    }
}
