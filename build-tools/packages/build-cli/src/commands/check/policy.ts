/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import { EOL as newline } from "node:os";
import * as path from "node:path";
import { Flags } from "@oclif/core";
import { readJson } from "fs-extra/esm";

import {
	BaseCommand,
	Context,
	Handler,
	Repository,
	policyHandlers,
} from "../../library/index.js";

type policyAction = "handle" | "resolve" | "final";

interface HandlerExclusions {
	[rule: string]: RegExp[];
}

/**
 * A convenience interface used to pass commonly used parameters to functions in this file.
 */
interface CheckPolicyCommandContext {
	/**
	 * A regular expression used to filter selected files.
	 */
	pathRegex: RegExp;

	/**
	 * A list of regular expressions used to exclude files from all handlers.
	 */
	exclusions: RegExp[];

	/**
	 * A list of handlers to apply to selected files.
	 */
	handlers: Handler[];

	/**
	 * A per-handler list of regular expressions used to exclude files from specific handlers.
	 */
	handlerExclusions: HandlerExclusions;

	/**
	 * Path to the root of the git repo.
	 */
	gitRoot: string;

	/**
	 * The repo context.
	 */
	context: Context;
}

/**
 * Stores performance data for each handler. Used to collect and display performance stats.
 */
const handlerPerformanceData = new Map<policyAction, Map<string, number>>();

/**
 * This tool enforces policies across the code base via a series of handler functions. The handler functions are
 * associated with a regular expression, and all files matching that expression.
 *
 * This command supports piping.
 *
 * i.e. `git ls-files -co --exclude-standard --full-name | flub check policy --stdin --verbose`
 */
export class CheckPolicy extends BaseCommand<typeof CheckPolicy> {
	static readonly description =
		"Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.";

	static readonly flags = {
		fix: Flags.boolean({
			description: `Fix errors if possible.`,
			required: false,
			char: "f",
		}),
		handler: Flags.string({
			description: `Filter policy handler names by <regex>.`,
			required: false,
			char: "d",
		}),
		excludeHandler: Flags.string({
			char: "D",
			description: `Exclude policy handler by name. Can be specified multiple times to exclude multiple handlers.`,
			exclusive: ["handler"],
			multiple: true,
		}),
		path: Flags.string({
			description: `Filter file paths by <regex>.`,
			required: false,
			char: "p",
		}),
		exclusions: Flags.file({
			description: `Path to the exclusions.json file.`,
			exists: true,
			char: "e",
			deprecated: {
				message:
					"Configure exclusions using the policy.exclusions field in the fluid-build config.",
				version: "0.26.0",
			},
		}),
		stdin: Flags.boolean({
			description: `Read list of files from stdin.`,
			required: false,
		}),
		listHandlers: Flags.boolean({
			description: `List all policy handlers by name.`,
			required: false,
			exclusive: ["stdin", "path", "fix", "handler"],
		}),
		...BaseCommand.flags,
	} as const;

	private processed = 0;
	private count = 0;

	async run(): Promise<void> {
		let handlersToRun: Handler[] = policyHandlers.filter((h) => {
			if (this.flags.excludeHandler === undefined || this.flags.excludeHandler.length === 0) {
				return true;
			}
			const shouldRun = this.flags.excludeHandler?.includes(h.name) === false;
			if (!shouldRun) {
				this.info(`Disabled handler: ${h.name}`);
			}
			return shouldRun;
		});

		// list the handlers then exit
		if (this.flags.listHandlers) {
			for (const h of handlersToRun) {
				this.log(
					`${h.name}\nresolver: ${h.resolver !== undefined} finalHandler: ${
						h.final !== undefined
					}\n`,
				);
			}
			this.log(`${handlersToRun.length} TOTAL POLICY HANDLERS`);
			this.exit(0);
		}

		const pathRegex: RegExp =
			this.flags.path === undefined ? /.?/ : new RegExp(this.flags.path, "i");

		if (this.flags.handler !== undefined) {
			const handlerRegex: RegExp = new RegExp(this.flags.handler, "i");
			this.info(`Filtering handlers by regex: ${handlerRegex}`);
			handlersToRun = handlersToRun.filter((h) => handlerRegex.test(h.name));
		}

		if (this.flags.path !== undefined) {
			this.info(`Filtering file paths by regex: ${pathRegex}`);
		}

		if (this.flags.fix) {
			this.info("Resolving errors if possible.");
		}

		const context = await this.getContext();
		const { policy } = context.flubConfig;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const rawExclusions: string[] =
			this.flags.exclusions === undefined
				? policy?.exclusions
				: await readJson(this.flags.exclusions);

		const exclusions: RegExp[] = rawExclusions.map((e) => new RegExp(e, "i"));
		const rawHandlerExclusions = policy?.handlerExclusions;

		const handlerExclusions: HandlerExclusions = {};
		if (rawHandlerExclusions) {
			for (const rule of Object.keys(rawHandlerExclusions)) {
				handlerExclusions[rule] = rawHandlerExclusions[rule].map((e) => new RegExp(e, "i"));
			}
		}

		const filePathsToCheck: string[] = [];
		const gitRoot = context.repo.resolvedRoot;

		if (this.flags.stdin) {
			const stdInput = await readStdin();

			if (stdInput !== undefined) {
				filePathsToCheck.push(...stdInput.split("\n"));
			}
		} else {
			const repo = new Repository({ baseDir: gitRoot }, "microsoft/FluidFramework");
			const gitFiles = await repo.getFiles(".");
			filePathsToCheck.push(...gitFiles);
		}

		const commandContext: CheckPolicyCommandContext = {
			pathRegex,
			exclusions,
			handlers: handlersToRun,
			handlerExclusions,
			gitRoot,
			context,
		};

		await this.executePolicy(filePathsToCheck, commandContext);
	}

	private async executePolicy(
		pathsToCheck: string[],
		commandContext: CheckPolicyCommandContext,
	): Promise<void> {
		try {
			for (const pathToCheck of pathsToCheck) {
				// eslint-disable-next-line no-await-in-loop
				await this.checkOrExcludeFile(pathToCheck, commandContext);
			}
		} finally {
			try {
				await runFinalHandlers(commandContext, this.flags.fix);
			} finally {
				this.logStats();
			}
		}
	}

	/**
	 * Routes files to their handlers and resolvers by regex testing their full paths. If a file fails a policy that has a
	 * resolver, the resolver will be invoked as well. Synchronizes the output, exit codes, and resolve
	 * decision for all handlers.
	 */
	private async routeToHandlers(
		file: string,
		commandContext: CheckPolicyCommandContext,
	): Promise<void> {
		const { context, handlers, handlerExclusions, gitRoot } = commandContext;

		// Use the repo-relative path so that regexes that specify string start (^) will match repo paths.
		const relPath = context.repo.relativeToRepo(file);

		const handlerResults = await Promise.all(
			handlers
				.filter((handler) => handler.match.test(relPath))
				.filter((handler) => {
					// doing exclusion per handler
					const exclusions = handlerExclusions[handler.name];
					if (exclusions !== undefined && !exclusions.every((regex) => !regex.test(relPath))) {
						this.verbose(`Excluded ${handler.name} handler: ${relPath}`);
						return false;
					}
					return true;
				})
				.map(async (handler): Promise<{ handler: Handler; result: string | undefined }> => {
					const result = await runWithPerf(handler.name, "handle", async () =>
						handler.handler(relPath, gitRoot),
					);
					return { handler, result };
				}),
		);

		// Now that all handlers have completed, we can react to results which might include running resolvers
		// that should only be applied one at a time. (Yes, there is an await in the loop intentionally.)
		for (const { handler, result } of handlerResults) {
			if (result !== undefined && result !== "") {
				let output = `${newline}file failed the "${handler.name}" policy: ${relPath}${newline}${result}`;
				const { resolver } = handler;
				if (this.flags.fix && resolver) {
					output += `${newline}attempting to resolve: ${relPath}`;
					// Resolvers are expected to be run serially to avoid any conflicts.
					// eslint-disable-next-line no-await-in-loop
					const resolveResult = await runWithPerf(handler.name, "resolve", async () =>
						resolver(relPath, gitRoot),
					);

					if (resolveResult?.message !== undefined) {
						output += newline + resolveResult.message;
					}

					if (!resolveResult.resolved) {
						process.exitCode = 1;
					}
				} else {
					process.exitCode = 1;
				}

				if (process.exitCode === 1) {
					this.warning(output);
				} else {
					this.info(output);
				}
			}
		}
	}

	private logStats(): void {
		this.log(
			`Statistics: ${this.processed} processed, ${this.count - this.processed} excluded, ${
				this.count
			} total`,
		);
		for (const [action, handlerPerf] of handlerPerformanceData.entries()) {
			this.log(`Performance for "${action}":`);
			for (const [handler, dur] of handlerPerf.entries()) {
				this.log(`\t${handler}: ${dur}ms`);
			}
		}
	}

	/**
	 * Given a string that represents a path to a file in the repo, determines if the file should be checked, and if so,
	 * routes the file to the appropriate handlers.
	 */
	private async checkOrExcludeFile(
		inputPath: string,
		commandContext: CheckPolicyCommandContext,
	): Promise<void> {
		const { exclusions, gitRoot, pathRegex } = commandContext;

		const filePath = path.join(gitRoot, inputPath).trim().replace(/\\/g, "/");

		if (!pathRegex.test(inputPath) || !fs.existsSync(filePath)) {
			return;
		}

		this.count++;
		if (!exclusions.every((value) => !value.test(inputPath))) {
			this.verbose(`Excluded all handlers: ${inputPath}`);
			return;
		}

		try {
			await this.routeToHandlers(filePath, commandContext);
		} catch (error: unknown) {
			throw new Error(
				`Error routing ${filePath} to handler: ${error}Stack: ${(error as Error).stack}`,
			);
		}

		this.processed++;
	}
}

async function runWithPerf<T>(
	name: string,
	action: policyAction,
	run: () => Promise<T>,
): Promise<T> {
	const actionMap = handlerPerformanceData.get(action) ?? new Map<string, number>();
	let dur = actionMap.get(name) ?? 0;

	const start = Date.now();
	const result = await run();
	dur += Date.now() - start;

	actionMap.set(name, dur);
	handlerPerformanceData.set(action, actionMap);
	return result;
}

/**
 * Runs all the "final" handlers. These handlers are intended to be run as the last step in policy checking, after
 * resolvers have run.
 */
async function runFinalHandlers(
	commandContext: CheckPolicyCommandContext,
	fix: boolean,
): Promise<void> {
	const { gitRoot, handlers } = commandContext;
	for (const h of handlers) {
		const { final } = h;
		if (final) {
			// eslint-disable-next-line no-await-in-loop
			const result = await runWithPerf(h.name, "final", async () => final(gitRoot, fix));
			// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
			if (result?.error) {
				throw new Error(result.error);
			}
		}
	}
}

async function readStdin(): Promise<string> {
	return new Promise((resolve) => {
		const stdin = process.openStdin();
		stdin.setEncoding("utf8");

		let data = "";
		stdin.on("data", (chunk) => {
			data += chunk;
		});

		stdin.on("end", () => {
			resolve(data);
		});

		if (stdin.isTTY) {
			resolve("");
		}
	});
}
