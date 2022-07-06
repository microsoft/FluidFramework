/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseCommand } from "../base";
import { bumpTypeFlag, packageSelectorFlag, releaseGroupFlag } from "../flags";

/**
 * A base command that sets up common flags that most bump-related commands should have.
 */
export abstract class BaseBumpCommand extends BaseCommand {
    static description = "Bump versions of packages and dependencies.";

    static flags = {
        ...super.flags,
        releaseGroup: releaseGroupFlag(),
        package: packageSelectorFlag(),
    };
}

/**
 * The root `bump` command.
 */
export default class BumpCommand extends BaseBumpCommand {
    static description = "Bump versions of packages and dependencies.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        ...super.flags,
        type: bumpTypeFlag(),
        releaseGroup: releaseGroupFlag(),
    };

    static args = [];

    async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(BumpCommand);
        this.error(`Not yet implemented`, { exit: 100 });
    }
}
