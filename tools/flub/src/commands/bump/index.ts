/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import { packageSelectorFlag, releaseGroupFlag, rootPathFlag } from "../../flags";

export abstract class BaseBumpCommand extends Command {
    static description = "Bump versions of packages and dependencies";

    static flags = {
        root: rootPathFlag(),
        releaseGroup: releaseGroupFlag(),
        package: packageSelectorFlag(),
    };

    // async run(): Promise<void> {
    // }
}

export default class BumpCommand extends BaseBumpCommand {
    static description = "Bump versions of packages and dependencies";

    static flags = {
        ...super.flags,
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(BumpCommand);

        this.log(
            `hello ${args.person} from ${flags.releaseGroup}! (./src/commands/hello/index.ts)`,
        );
    }
}
