/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import { bumpDependencies, cleanPrereleaseDependencies } from "@fluidframework/build-tools";
import { BaseBumpCommand } from "../bump";
import { packageSelectorFlag } from "../../flags";

/**
 * The `bump deps` command. This command is equivalent to `fluid-bump-version --dep`.
 */
export default class DepsCommand extends BaseBumpCommand {
    static description = "Bump the dependencies version of specified package or release group";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        ...super.flags,
        package: packageSelectorFlag(),
        prerelease: Flags.boolean({
            char: "l",
            default: false,
            description: "Bump pre-release packages to release versions if possible.",
            hidden: false,
            exclusive: ["package"],
        }),
    };

    public async run(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { args, flags } = await this.parse(DepsCommand);
        const context = await this.getContext();

        if (flags.prerelease) {
            await cleanPrereleaseDependencies(context, false, false);
            this.exit();
        }

        if (flags.package === undefined) {
            this.error("No dependency provided.");
        }

        const packagesToBump = new Map<string, string | undefined>();
        if (Array.isArray(flags.package)) {
            for (const { dep, version } of flags.package) {
                packagesToBump.set(dep, version);
            }
        } else {
            const { dep, version } = flags.package;
            packagesToBump.set(dep, version);
        }

        await bumpDependencies(context, "Bump dependencies version", packagesToBump, false, false);
    }
}
