/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, getResolvedFluidRoot, GitRepo, Logger } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import { FlagInput, OutputFlags, ParserOutput } from "@oclif/core/lib/interfaces";
import chalk from "chalk";
import { rootPathFlag } from "./flags";

// This is needed to get type safety working in derived classes.
// https://github.com/oclif/oclif.github.io/pull/142
export type InferredFlagsType<T> = T extends FlagInput<infer F>
    ? F & { json: boolean | undefined }
    : any;

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand<T extends typeof BaseCommand.flags> extends Command {
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

    protected parsedOutput?: ParserOutput<any, any>;

    /** The processed arguments that were passed to the CLI. */
    get processedArgs(): { [name: string]: any } {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.parsedOutput?.args ?? {};
    }

    /** The processed flags that were passed to the CLI. */
    get processedFlags(): InferredFlagsType<T> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.parsedOutput?.flags ?? {};
    }

    /** The flags defined on the base class. */
    private get baseFlags() {
        return this.processedFlags as Partial<OutputFlags<typeof BaseCommand.flags>>;
    }

    private _context: Context | undefined;
    private _logger: Logger | undefined;

    async init() {
        this.parsedOutput = await this.parse(this.ctor);
    }

    async catch(err: any) {
        // add any custom logic to handle errors from the command
        // or simply return the parent class error handling
        return super.catch(err);
    }

    async finally(err: any) {
        // called after run and catch regardless of whether or not the command errored
        return super.finally(err);
    }

    /**
     * @returns A default logger that can be passed to core functions enabling them to log using the command logging
     * system */
    protected async getLogger(): Promise<Logger> {
        if (this._logger === undefined) {
            this._logger = {
                log: (msg: string | Error) => {
                    this.log(msg.toString());
                },
                logWarning: this.warn.bind(this),
                logError: (msg: string | Error) => {
                    this.error(msg);
                },
                logVerbose: (msg: string | Error) => {
                    this.verbose(msg);
                },
            };
        }

        return this._logger;
    }

    /**
     * The repo {@link Context}. The context is retrieved and cached the first time this method is called. Subsequent
     * calls will return the cached context.
     *
     * @returns The repo {@link Context}.
     */
    async getContext(): Promise<Context> {
        if (this._context === undefined) {
            const resolvedRoot = await getResolvedFluidRoot();
            const gitRepo = new GitRepo(resolvedRoot);
            const branch = await gitRepo.getCurrentBranchName();
            const logger = await this.getLogger();

            this.verbose(`Repo: ${resolvedRoot}`);
            this.verbose(`Branch: ${branch}`);

            this._context = new Context(
                gitRepo,
                "github.com/microsoft/FluidFramework",
                branch,
                logger,
            );
        }

        return this._context;
    }

    public warn(message: string | Error): string | Error {
        this.log(chalk.yellow(`WARNING: ${message}`));
        return message;
    }

    public verbose(message: string | Error): string | Error {
        if (this.baseFlags.verbose === true) {
            if (typeof message === "string") {
                this.log(chalk.grey(`VERBOSE: ${message}`));
            } else {
                this.log(chalk.red(`VERBOSE: ${message}`));
            }
        }

        return message;
    }

    /** Output a horizontal rule. */
    public logHr() {
        this.log("=".repeat(72));
    }

    public logError(message: string | Error) {
        this.log(chalk.red(`ERROR: ${message}`));
        this.exit();
    }

    /** Log a message with an indent. */
    public logIndent(input: string, indent = 2) {
        this.log(`${" ".repeat(indent)}${input}`);
    }
}
