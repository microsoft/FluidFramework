/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, getResolvedFluidRoot, GitRepo } from "@fluidframework/build-tools";
import { Command, Flags } from "@oclif/core";
import {
    FlagInput,
    OutputFlags,
    ParserOutput,
    PrettyPrintableError,
    // eslint-disable-next-line import/no-internal-modules
} from "@oclif/core/lib/interfaces";
import chalk from "chalk";
import { rootPathFlag } from "./flags";
import { indentString } from "./lib";
import { CommandLogger } from "./logging";

/**
 * @remarks This is needed to get type safety working in derived classes.
 * See {@link https://github.com/oclif/oclif.github.io/pull/142}.
 */
export type InferredFlagsType<T> = T extends FlagInput<infer F>
    ? F & { json: boolean | undefined }
    : any;

/**
 * A base command that sets up common flags that all commands should have. All commands should have this class in their
 * inheritance chain.
 */
export abstract class BaseCommand<T extends typeof BaseCommand.flags>
    extends Command
    implements CommandLogger
{
    static flags = {
        root: rootPathFlag(),
        verbose: Flags.boolean({
            char: "v",
            description: "Verbose logging.",
            required: false,
        }),
        timer: Flags.boolean({
            default: false,
            hidden: true,
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
    private _logger: CommandLogger | undefined;

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
     * system
     */
    protected get logger(): CommandLogger {
        if (this._logger === undefined) {
            this._logger = {
                info: (msg: string | Error) => {
                    this.info(msg.toString());
                },
                warning: this.warning.bind(this),
                errorLog: (msg: string | Error) => {
                    this.errorLog(msg);
                },
                verbose: (msg: string | Error) => {
                    this.verbose(msg);
                },
                logHr: this.logHr.bind(this),
                logIndent: this.logIndent.bind(this),
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
            const gitRepo = new GitRepo(resolvedRoot, this.logger);
            const branch = await gitRepo.getCurrentBranchName();

            this.verbose(`Repo: ${resolvedRoot}`);
            this.verbose(`Branch: ${branch}`);

            this._context = new Context(
                gitRepo,
                "github.com/microsoft/FluidFramework",
                branch,
                this.logger,
            );
        }

        return this._context;
    }

    /**
     * Outputs a horizontal rule.
     */
    public logHr() {
        this.log("=".repeat(72));
    }

    /**
     * Logs a message with an indent.
     */
    public logIndent(input: string, indentNumber = 2) {
        const message = indentString(input, indentNumber);
        this.info(message);
    }

    /**
     * Logs an informational message.
     */
    public info(message: string | Error) {
        this.log(`INFO: ${message}`);
    }

    /**
     * Logs an error without exiting.
     */
    public errorLog(message: string | Error) {
        this.log(chalk.red(`ERROR: ${message}`));
    }

    /**
     * Logs a warning.
     */
    public warning(message: string | Error): string | Error {
        this.log(chalk.yellow(`WARNING: ${message}`));
        return message;
    }

    /**
     * Logs a warning with a stack trace in debug mode.
     */
    public warningWithDebugTrace(message: string | Error): string | Error {
        return super.warn(message);
    }

    /**
     * @deprecated Use {@link BaseCommand.warning}  or {@link BaseCommand.warningWithDebugTrace} instead.
     */
    public warn(input: string | Error): string | Error {
        return super.warn(input);
    }

    /**
     * Logs an error and exits the process. If you don't want to exit the process use {@link BaseCommand.errorLog}
     * instead.
     *
     * @param input - an Error or a error message string,
     * @param options - options for the error handler.
     *
     * @remarks
     *
     * This method overrides the oclif Command error method so we can do some formatting on the strings.
     */
    public error(
        input: string | Error,
        options: { code?: string | undefined; exit: false } & PrettyPrintableError,
    ): void;

    /**
     * Logs an error and exits the process. If you don't want to exit the process use {@link BaseCommand.errorLog}
     * instead.
     *
     * @param input - an Error or a error message string,
     * @param options - options for the error handler.
     *
     * @remarks
     *
     * This method overrides the oclif Command error method so we can do some formatting on the strings.
     */
    public error(
        input: string | Error,
        options?:
            | ({ code?: string | undefined; exit?: number | undefined } & PrettyPrintableError)
            | undefined,
    ): never;

    /**
     * Logs an error and exits the process. If you don't want to exit the process use {@link BaseCommand.errorLog}
     * instead.
     *
     * @param input - an Error or a error message string,
     * @param options - options for the error handler.
     *
     * @remarks
     *
     * This method overrides the oclif Command error method so we can do some formatting on the strings.
     */
    public error(input: unknown, options?: unknown): void {
        if (typeof input === "string") {
            return super.error(chalk.red(input), options as any);
        }

        return super.error(input as Error, options as any);
    }

    /** Logs a verbose log statement. */
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
}
