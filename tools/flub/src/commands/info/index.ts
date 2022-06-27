/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import { BaseCommand } from "../../base";
import { packageSelectorFlag, releaseGroupFlag } from "../../flags";

export default class InfoCommand extends BaseCommand {
    static description = "Get info about the repo, release groups, and packages";

    static flags = {
        ...super.flags,
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(InfoCommand);

        this.error(`Not yet implemented`);
    }
}
