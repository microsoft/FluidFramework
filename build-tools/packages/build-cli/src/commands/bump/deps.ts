/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseBumpCommand } from "../bump";

/**
 * The `bump deps` command. This command is equivalent to `fluid-bump-version --dep`.
 */
export default class DepsCommand extends BaseBumpCommand {
    static description = "Bump the dependencies version of specified package or release group";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        ...super.flags,
    };

    public async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(DepsCommand);

        this.log(`hello from deps`);
        this.error(`Not yet implemented`, { exit: 100 });
    }
}
