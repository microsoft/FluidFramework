/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Flags } from "@oclif/core";
import {
    bumpDependencies,
    cleanPrereleaseDependencies,
    isMonoRepoKind,
} from "@fluidframework/build-tools";
import { BaseBumpCommand } from "../bump";
import { packageSelectorFlag, releaseGroupFlag } from "../../flags";

/**
 * The `bump deps` command. This command is equivalent to `fluid-bump-version --dep`.
 */
export default class DepsCommand extends BaseBumpCommand {
    static description = "Bump the dependencies version of specified package or release group";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        ...super.flags,
        package: packageSelectorFlag(),
        releaseGroup: releaseGroupFlag(),
        prerelease: Flags.boolean({
            char: "l",
            default: false,
            description: "Bump pre-release packages to release versions if possible.",
            exclusive: ["package"],
        }),
        install: Flags.boolean({
            char: "i",
            default: false,
            description: "Update the lock file by running 'npm install' automatically.",
        }),
        commit: Flags.boolean({
            char: "c",
            default: false,
            description: "Commit the changes to a new branch.",
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
        const { dep, version } = flags.package;
        packagesToBump.set(dep, version);

        // eslint-disable-next-line unicorn/prefer-ternary
        if (flags.releaseGroup !== undefined && isMonoRepoKind(flags.releaseGroup)) {
            await bumpDependencies(
                context,
                packagesToBump,
                false,
                false,
                "Bump dependencies version",
                false,
                flags.releaseGroup,
            );
        } else {
            await bumpDependencies(
                context,
                packagesToBump,
                false,
                false,
                "Bump dependencies version",
                false,
            );
        }
    }
}
