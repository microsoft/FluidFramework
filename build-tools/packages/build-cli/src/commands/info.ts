/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseCommand } from "../base";

/**
 * The root `info` command.
 */
export default class InfoCommand extends BaseCommand {
    static description = "Get info about the repo, release groups, and packages";

    static flags = {
        ...super.flags,
    };

    static args = [];

    async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(InfoCommand);

        this.error(`Not yet implemented`);
    }
}
