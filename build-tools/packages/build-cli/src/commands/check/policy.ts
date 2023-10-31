/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import * as fs from "node:fs";
import { readJson } from "fs-extra";
import { EOL as newline } from "node:os";
import path from "node:path";

import { Context, getFluidBuildConfig, Handler, policyHandlers } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";
import { Repository } from "../../lib";

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

		const manifest = getFluidBuildConfig(this.flags.root ?? process.cwd());

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const rawExclusions: string[] =
			this.flags.exclusions === undefined
				? manifest.policy?.exclusions
				: await readJson(this.flags.exclusions);

		const exclusions: RegExp[] = rawExclusions.map((e) => new RegExp(e, "i"));

		const rawHandlerExclusions = manifest?.policy?.handlerExclusions;

		const handlerExclusions: HandlerExclusions = {};
		if (rawHandlerExclusions) {
			for (const rule of Object.keys(rawHandlerExclusions)) {
				handlerExclusions[rule] = rawHandlerExclusions[rule].map((e) => new RegExp(e, "i"));
			}
		}

		const filePathsToCheck: string[] = [];
		const context = await this.getContext();
		const gitRoot = context.repo.resolvedRoot;

		if (this.flags.stdin) {
			const stdInput = await readStdin();

			if (stdInput !== undefined) {
				filePathsToCheck.push(...stdInput.split("\n"));
			}
		} else {
			const repo = new Repository({ baseDir: gitRoot });
			const gitFiles = await repo.gitClient.raw(
				"ls-files",
				"-co",
				"--exclude-standard",
				"--full-name",
			);

			filePathsToCheck.push(...gitFiles.split("\n"));
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
			pathsToCheck.map((line: string) => this.handleLine(line, commandContext));
		} finally {
			try {
				runPolicyCheck(commandContext, this.flags.fix);
			} finally {
				this.logStats();
			}
		}
	}

	/**
	 * Routes files to their handlers by regex testing their full paths. Synchronize the output, exit code, and resolve
	 * decision for all handlers.
	 */
	private routeToHandlers(file: string, commandContext: CheckPolicyCommandContext): void {
		const { context, handlers, handlerExclusions, gitRoot } = commandContext;

		// Use the repo-relative path so that regexes that specify string start (^) will match repo paths.
		const relPath = context.repo.relativeToRepo(file);

		handlers
			.filter((handler) => handler.match.test(relPath))
			// eslint-disable-next-line unicorn/no-array-for-each
			.forEach((handler) => {
				// doing exclusion per handler
				const exclusions = handlerExclusions[handler.name];
				if (
					exclusions !== undefined &&
					!exclusions.every((regex) => !regex.test(relPath))
				) {
					this.verbose(`Excluded ${handler.name} handler: ${relPath}`);
					return;
				}

				const result = runWithPerf(handler.name, "handle", () =>
					handler.handler(relPath, gitRoot),
				);
				if (result !== undefined && result !== "") {
					let output = `${newline}file failed policy check: ${relPath}${newline}${result}`;
					const { resolver } = handler;
					if (this.flags.fix && resolver) {
						output += `${newline}attempting to resolve: ${relPath}`;
						const resolveResult = runWithPerf(handler.name, "resolve", () =>
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
			});
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

	private handleLine(line: string, commandContext: CheckPolicyCommandContext): void {
		const { exclusions, gitRoot, pathRegex } = commandContext;

		const filePath = path.join(gitRoot, line).trim().replace(/\\/g, "/");

		if (!pathRegex.test(line) || !fs.existsSync(filePath)) {
			return;
		}

		this.count++;
		if (!exclusions.every((value) => !value.test(line))) {
			this.verbose(`Excluded all handlers: ${line}`);
			return;
		}

		try {
			this.routeToHandlers(filePath, commandContext);
		} catch (error: unknown) {
			throw new Error(`Line error: ${error}`);
		}

		this.processed++;
	}
}

function runWithPerf<T>(name: string, action: policyAction, run: () => T): T {
	const actionMap = handlerPerformanceData.get(action) ?? new Map<string, number>();
	let dur = actionMap.get(name) ?? 0;

	const start = Date.now();
	const result = run();
	dur += Date.now() - start;

	actionMap.set(name, dur);
	handlerPerformanceData.set(action, actionMap);
	return result;
}

function runPolicyCheck(commandContext: CheckPolicyCommandContext, fix: boolean): void {
	const { gitRoot, handlers } = commandContext;
	for (const h of handlers) {
		const { final } = h;
		if (final) {
			const result = runWithPerf(h.name, "final", () => final(gitRoot, fix));
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
