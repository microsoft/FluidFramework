/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Command, Flags, Interfaces } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import { type PrettyPrintableError } from "@oclif/core/lib/interfaces";
import chalk from "chalk";

import { Context, GitRepo, getResolvedFluidRoot } from "@fluidframework/build-tools";

import { rootPathFlag } from "./flags";
import { indentString } from "./lib";
import { CommandLogger } from "./logging";

/**
 * A type representing all the flags of the base commands and subclasses.
 */
export type Flags<T extends typeof Command> = Interfaces.InferredFlags<
	typeof BaseCommand["baseFlags"] & T["flags"]
>;
export type Args<T extends typeof Command> = Interfaces.InferredArgs<T["args"]>;

/**
 * A base command that sets up common flags that all commands should have. Most commands should have this class in their
 * inheritance chain.
 *
 * @remarks
 *
 * This implementation is based on the documentation at https://oclif.io/docs/base_class
 */
export abstract class BaseCommand<T extends typeof Command>
	extends Command
	implements CommandLogger
{
	/**
	 * The flags defined on the base class.
	 */
	static baseFlags = {
		root: rootPathFlag({
			helpGroup: "GLOBAL",
		}),
		verbose: Flags.boolean({
			char: "v",
			description: "Verbose logging.",
			helpGroup: "GLOBAL",
			required: false,
		}),
		timer: Flags.boolean({
			default: false,
			hidden: true,
			helpGroup: "GLOBAL",
		}),
	};

	protected flags!: Flags<T>;
	protected args!: Args<T>;
	private _context: Context | undefined;
	private _logger: CommandLogger | undefined;

	public async init(): Promise<void> {
		await super.init();

		const { args, flags } = await this.parse({
			flags: this.ctor.flags,
			baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
			args: this.ctor.args,
			strict: this.ctor.strict,
		});
		this.flags = flags as Flags<T>;
		this.args = args as Args<T>;
	}

	protected async catch(err: Error & { exitCode?: number }): Promise<any> {
		// add any custom logic to handle errors from the command
		// or simply return the parent class error handling
		return super.catch(err);
	}

	protected async finally(_: Error | undefined): Promise<any> {
		// called after run and catch regardless of whether or not the command errored
		return super.finally(_);
	}

	/**
	 * @returns A default logger that can be passed to core functions enabling them to log using the command logging
	 * system
	 */
	protected get logger(): CommandLogger {
		if (this._logger === undefined) {
			this._logger = {
				log: this.log.bind(this),
				info: this.info.bind(this),
				warning: this.warning.bind(this),
				errorLog: this.errorLog.bind(this),
				verbose: this.verbose.bind(this),
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
			const resolvedRoot = await (this.flags.root ?? getResolvedFluidRoot(this.logger));
			const gitRepo = new GitRepo(resolvedRoot, this.logger);
			const branch = await gitRepo.getCurrentBranchName();

			this.verbose(`Repo: ${resolvedRoot}`);
			this.verbose(`Branch: ${branch}`);

			this._context = new Context(gitRepo, "microsoft/FluidFramework", branch, this.logger);
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
		this.log(message);
	}

	/**
	 * Logs an informational message.
	 */
	public info(message: string | Error | undefined) {
		this.log(`INFO: ${message}`);
	}

	/**
	 * Logs an error without exiting.
	 */
	public errorLog(message: string | Error | undefined) {
		this.log(chalk.red(`ERROR: ${message}`));
	}

	/**
	 * Logs a warning.
	 */
	public warning(message: string | Error | undefined): void {
		this.log(chalk.yellow(`WARNING: ${message}`));
	}

	/**
	 * Logs a warning with a stack trace in debug mode.
	 */
	public warningWithDebugTrace(message: string | Error): string | Error {
		return super.warn(message);
	}

	/**
	 * @deprecated Use {@link BaseCommand.warning} or {@link BaseCommand.warningWithDebugTrace} instead.
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

	/**
	 * Logs a verbose log statement.
	 */
	public verbose(message: string | Error | undefined): void {
		if (this.flags.verbose === true) {
			if (typeof message === "string") {
				this.log(chalk.grey(`VERBOSE: ${message}`));
			} else {
				this.log(chalk.red(`VERBOSE: ${message}`));
			}
		}
	}
}
