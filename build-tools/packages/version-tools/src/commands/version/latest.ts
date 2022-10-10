/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Command, Flags } from "@oclif/core";

import { getLatestReleaseFromList } from "../../schemes";

/**
 * The `version latest` command is used to find the latest (highest) version in a list of versions. The command takes
 * the Fluid internal version scheme into account, and handles prerelease versions properly.
 *
 * Once scenario where this is useful is for Fluid customers who want to consume the most recent version from npm. The
 * standard tools (e.g. `npm show versions`) don't fully work in that scenario because the Fluid internal version scheme
 * overloads the semver prerelease field.
 */
// eslint-disable-next-line import/no-default-export
export default class LatestCommand extends Command {
    static description =
        "Find the latest version from a list of version strings, accounting for the Fluid internal version scheme.";

    static enableJsonFlag = true;

    static flags = {
        versions: Flags.string({
            char: "r",
            description:
                "The versions to evaluate. The argument can be passed multiple times to provide multiple versions, or a space-delimited list of versions can be provided using a single argument.",
            multiple: true,
            required: true,
        }),
        prerelease: Flags.boolean({
            default: false,
            description:
                "Include prerelease versions. By default, prerelease versions are excluded.",
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
            latest: getLatestReleaseFromList(flags.versions, flags.prerelease),
        };

        this.log(data.latest);

        // When the --json flag is passed, the command will return the raw data as JSON.
        return data;
    }
}
