/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, getResolvedFluidRoot, GitRepo } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
import { rootPathFlag } from "./flags";

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
        verbose: Flags.boolean({
            char: "v",
            description: "Verbose logging.",
            required: false,
        }),
    };

    private _context: Context | undefined;

    /**
     * The repo {@link Context}. The context is retrieved and cached the first time this method is called. Subsequent
     * calls will return the cached context.
     *
     * @param logVerbose - Set to true to enable logging.
     * @returns The repo {@link Context}.
     */
    async getContext(logVerbose = false): Promise<Context> {
        if (this._context === undefined) {
            const resolvedRoot = await getResolvedFluidRoot();
            const gitRepo = new GitRepo(resolvedRoot);
            const branch = await gitRepo.getCurrentBranchName();

            this.log(`Repo: ${resolvedRoot}`);
            this.log(`Branch: ${branch}`);

            this._context = new Context(
                gitRepo,
                "github.com/microsoft/FluidFramework",
                branch,
                logVerbose,
            );
        }

        return this._context;
    }
}
