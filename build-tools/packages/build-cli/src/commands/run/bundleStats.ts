/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { execSync } from "child_process";

import { BaseCommand } from "../../base";

export default class RunBundlestats extends BaseCommand<typeof RunBundlestats.flags> {
    static description = `Generate a report from input bundle stats collected through the collect bundleStats command.`;

    static flags = {
        dirname: Flags.string({
            description: "[default: current directory] Directory containing bundle stats input",
            required: false,
        }),
        ...BaseCommand.flags,
    };

    public async run(): Promise<void> {
        const flags = this.processedFlags;
        // eslint-disable-next-line unicorn/prefer-module
        const dirname = flags.dirname ?? __dirname;

        execSync(`npx danger ci -d ${dirname}/lib/dangerfile.js`, { stdio: "inherit" });
    }
}
