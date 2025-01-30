/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getResolvedFluidRoot } from "@fluidframework/build-tools";
import { Command, Flags, Interfaces } from "@oclif/core";
// eslint-disable-next-line import/no-internal-modules
import type { PrettyPrintableError } from "@oclif/core/errors";
import chalk from "picocolors";

import { type IBuildProject, loadBuildProject } from "@fluid-tools/build-infrastructure";
import { CommandLogger } from "../../logging.js";
import { Context } from "../context.js";
import { indentString } from "../text.js";

/**
 * A type representing all the flags of the base commands and subclasses.
 */
export type Flags<T extends typeof Command> = Interfaces.InferredFlags<
	(typeof BaseCommand)["baseFlags"] & T["flags"]
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
	static readonly baseFlags = {
		verbose: Flags.boolean({
			char: "v",
			description: "Enable verbose logging.",
			helpGroup: "LOGGING",
			exclusive: ["quiet"],
			required: false,
			default: false,
		}),
		quiet: Flags.boolean({
			description: "Disable all logging.",
			helpGroup: "LOGGING",
			exclusive: ["verbose"],
			required: false,
			default: false,
		}),
		root: Flags.custom({
			description: "Root directory of the Fluid repo (default: env _FLUID_ROOT_).",
			env: "_FLUID_ROOT_",
			hidden: true,
		})(),
		flubConfig: Flags.file({
			description: `A path to a flub config file. If this is not provided, it will look up the directory tree to find the closest config file.`,
			required: false,
			exists: true,
			hidden: true,
			helpGroup: "GLOBAL",
		}),
		timer: Flags.boolean({
			default: false,
			hidden: true,
			helpGroup: "GLOBAL",
		}),
	} as const;

	protected flags!: Flags<T>;
	protected args!: Args<T>;

	/**
	 * If true, all logs except those sent using the .log function will be suppressed.
	 */
	private suppressLogging: boolean = false;

	private _context: Context | undefined;
	private _logger: CommandLogger | undefined;

	public async init(): Promise<void> {
		await super.init();

		const { args, flags } = await this.parse({
			flags: this.ctor.flags,
			baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
			enableJsonFlag: this.ctor.enableJsonFlag,
			args: this.ctor.args,
			strict: this.ctor.strict,
		});
		this.flags = flags as Flags<T>;
		this.args = args as Args<T>;

		this.suppressLogging = this.flags.quiet;
	}

	protected async catch(err: Error & { exitCode?: number }): Promise<unknown> {
		// add any custom logic to handle errors from the command
		// or simply return the parent class error handling
		return super.catch(err);
	}

	protected async finally(_: Error | undefined): Promise<unknown> {
		// called after run and catch regardless of whether or not the command errored
		return super.finally(_);
	}

	/**
	 * A default logger that can be passed to core functions enabling them to log using the command logging
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
			const resolvedRoot = await getResolvedFluidRoot();

			this._context = new Context(resolvedRoot);
		}

		return this._context;
	}

	/**
	 * Outputs a horizontal rule.
	 */
	public logHr(): void {
		this.log("=".repeat(Math.max(10, process.stdout.columns)));
	}

	/**
	 * Logs a message with an indent.
	 */
	public logIndent(input: string, indentNumber = 2): void {
		const message = indentString(input, indentNumber);
		this.log(message);
	}

	/**
	 * Logs an informational message.
	 */
	public info(message: string | Error | undefined): void {
		if (!this.suppressLogging) {
			this.log(`INFO: ${message}`);
		}
	}

	/**
	 * Logs an error without exiting.
	 */
	public errorLog(message: string | Error | undefined): void {
		if (!this.suppressLogging) {
			this.log(chalk.red(`ERROR: ${message}`));
		}
	}

	/**
	 * Logs a warning.
	 */
	public warning(message: string | Error): string | Error {
		if (!this.suppressLogging) {
			this.log(chalk.yellow(`WARNING: ${message}`));
		}
		return message;
	}

	/**
	 * Logs a warning with a stack trace in debug mode.
	 */
	public warningWithDebugTrace(message: string | Error): string | Error {
		return this.suppressLogging ? "" : this.warning(message);
	}

	// eslint-disable-next-line jsdoc/require-description
	/**
	 * @deprecated Use {@link BaseCommand.warning} or {@link BaseCommand.warningWithDebugTrace} instead.
	 */
	public warn(input: string | Error): string | Error {
		return this.suppressLogging ? "" : this.warning(input);
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
		if (!this.suppressLogging) {
			if (typeof input === "string") {
				// Ignoring lint error because the typings here come from oclif and the options type oclif has is complex. It's
				// not worth replicating in this call.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
				super.error(chalk.red(input), options as any);
			}

			// Ignoring lint error because the typings here come from oclif and the options type oclif has is complex. It's
			// not worth replicating in this call.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
			return super.error(input as Error, options as any);
		}
	}

	/**
	 * Logs a verbose log statement.
	 */
	public verbose(message: string | Error): string | Error {
		if (this.flags.verbose === true) {
			const color = typeof message === "string" ? chalk.gray : chalk.red;
			this.log(color(`VERBOSE: ${message}`));
		}
		return message;
	}
}

export abstract class BaseCommandWithBuildProject<
	T extends typeof Command,
> extends BaseCommand<T> {
	private _buildProject: IBuildProject | undefined;

	/**
	 * This method is deprecated and should only be called in BaseCommand instances.
	 *
	 * @deprecated This method should only be called in BaseCommand instances.
	 */
	public getContext(): never {
		throw new Error("getContext method should only be called in BaseCommand instances");
	}

	/**
	 * Gets the build project for the current command. The build project is loaded from the closest build root to searchPath.
	 *
	 * @param searchPath - The path to search for the build project.
	 * @returns The build project.
	 */
	public getBuildProject(searchPath?: string): IBuildProject {
		if (this._buildProject === undefined) {
			const root = searchPath ?? process.cwd();
			this._buildProject = loadBuildProject(root);
		}

		return this._buildProject;
	}
}
