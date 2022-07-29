/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, getResolvedFluidRoot, GitRepo } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
import chalk from "chalk";
import { rootPathFlag } from "./flags";

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand extends Command {
    static flags = {
        root: rootPathFlag(),
        timer: Flags.boolean({
            default: false,
            hidden: true,
        }),
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
    async getContext(logVerbose: boolean): Promise<Context> {
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

    logWarn(message?: string, preMessage = "WARNING", ...args: unknown[]): void {
        this.log(chalk.yellow(`${preMessage}: ${message}`), ...args);
    }
}

/**
 * A base class that should be used by commands that possibly modify repo state. Such commands should provide a
 * consistent set of flags to control which checks should be run or skipped.
 */
export abstract class RepoStateModifyingCommand extends BaseCommand {
    static flags = {
        policy: Flags.boolean({
            allowNo: true,
            default: true,
            description: "Check policy before making changes.",
        }),
        branchCheck: Flags.boolean({
            allowNo: true,
            default: true,
            description: "Commit the changes to a new branch.",
        }),
        updateCheck: Flags.boolean({
            allowNo: true,
            default: true,
            description: "Check that the local repo is up to date with the remote.",
        }),
        install: Flags.boolean({
            allowNo: true,
            char: "i",
            default: true,
            description: "Update lockfiles by running 'npm install' automatically.",
        }),
        ...super.flags,
    };
}
