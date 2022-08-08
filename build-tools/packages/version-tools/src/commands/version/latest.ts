/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Command, Flags } from "@oclif/core";
import { getLatestReleaseFromList } from "../../schemes";

/**
 * The root `version` command.
 */
// eslint-disable-next-line import/no-default-export
export default class LatestCommand extends Command {
    static description =
        "Find the latest version from a list of version strings, accounting for the Fluid internal version scheme.";

    static enableJsonFlag = true;

    static flags = {
        versions: Flags.string({
            char: "r",
            description: "The public version to use in the Fluid internal version.",
            multiple: true,
            required: true,
        }),
    };

    static examples = [
        {
            description: "You can use the --versions (-r) flag multiple times.",
            command:
                "<%= config.bin %> <%= command.id %> -r 2.0.0 -r 2.0.0-internal.1.0.0 -r 1.0.0 -r 0.56.1000",
        },
        {
            description:
                "You can omit the repeated --versions (-r) flag and pass a space-delimited list instead.",
            command:
                "<%= config.bin %> <%= command.id %> -r 2.0.0 2.0.0-internal.1.0.0 1.0.0 0.56.1000",
        },
    ];

    async run(): Promise<{
        latest: string;
    }> {
        const { flags } = await this.parse(LatestCommand);

        const data = {
            latest: getLatestReleaseFromList(flags.versions),
        };

        this.log(data.latest);

        // When the --json flag is passed, the command will return the raw data as JSON.
        return data;
    }
}
