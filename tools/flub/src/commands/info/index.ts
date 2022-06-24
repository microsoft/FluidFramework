/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import { packageSelectorFlag, releaseGroupFlag } from "../../flags";

export default class InfoCommand extends Command {
    static description = "Bump versions of packages and dependencies";

    static examples = [
        `$ oex hello friend --from oclif
hello friend from oclif! (./src/commands/hello/index.ts)
`,
    ];

    static flags = {
        releaseGroup: releaseGroupFlag(),
        package: packageSelectorFlag(),
    };

    static args = [];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(InfoCommand);

        this.log(
            `hello ${args.person} from ${flags.releaseGroup}! (./src/commands/hello/index.ts)`,
        );
    }
}
