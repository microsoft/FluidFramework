/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Context,
    createReleaseBump,
    getResolvedFluidRoot,
    GitRepo,
} from "@fluidframework/build-tools";
import { Command } from "@oclif/core";
import { rootPathFlag } from "./flags";

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
    };

    private _context: Context | undefined;

    async getContext(): Promise<Context> {
        if (this._context === undefined) {
            const resolvedRoot = await getResolvedFluidRoot();
            this.log(`Repo: ${resolvedRoot}`);
            const gitRepo = new GitRepo(resolvedRoot);
            const branch = await gitRepo.getCurrentBranchName();
            this.log(`Branch: ${branch}`);
            this._context = new Context(gitRepo, "github.com/microsoft/FluidFramework", branch);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this._context;
    }
}
