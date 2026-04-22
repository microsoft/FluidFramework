/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawn } from "node:child_process";
import { Command } from "@oclif/core";

/**
 * Environment variable that controls which workspace packages the wrapped
 * `pnpm` invocation targets. Pipeline jobs set this to one or more
 * `--filter "<pattern>"` fragments (space-separated) to scope command
 * execution to packages affected by a PR. When unset or empty, the command
 * falls back to `-r` — the pre-existing "run across every workspace package"
 * behavior — so local developers get unchanged semantics out of the box.
 */
const FILTER_ENV_VAR = "FLUID_PNPM_FILTER";

/**
 * Split {@link FILTER_ENV_VAR} into argv tokens, preserving single- and
 * double-quoted patterns as a single argument each. This lets callers write
 * `FLUID_PNPM_FILTER='--filter "@fluidframework/map..." --filter "@fluidframework/tree..."'`
 * and have the two filter patterns arrive at pnpm as distinct argv entries.
 */
export function tokenizeFilter(input: string): string[] {
	const trimmed = input.trim();
	if (trimmed === "") {
		return ["-r"];
	}
	const tokens: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic exec loop
	while ((match = re.exec(trimmed)) !== null) {
		tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
	}
	return tokens;
}

export default class PnpmRunCommand extends Command {
	static readonly description =
		`Invoke pnpm with a workspace filter read from the ${FILTER_ENV_VAR} environment variable. ` +
		`Falls back to \`-r\` (run across every workspace package) when the variable is unset or ` +
		`empty, preserving the historical recursive behavior. Every argument after the command ` +
		`name is forwarded to pnpm verbatim.\n\n` +
		`Why this command exists: pnpm honors the npm-style env-var convention, so setting ` +
		`\`npm_config_filter=<pattern>\` can supply a single \`--filter\` value natively. But ` +
		`\`--filter\` is an array-valued option and pnpm has no documented env-var syntax for ` +
		`passing multiple values in one invocation — the array form (\`filter[]=...\`) is only ` +
		`honored in \`.npmrc\`, which is a static file, not per-invocation input, and env-var ` +
		`expansion is not applied inside \`.npmrc\` array values (pnpm/pnpm#8495). CI jobs need ` +
		`to scope a single command to the full set of packages affected by a PR (typically ` +
		`several), so this command tokenizes ${FILTER_ENV_VAR} into multiple \`--filter\` ` +
		`fragments and splices them before the forwarded argv — something pnpm cannot do on ` +
		`its own from a single env var.`;

	// Everything after the command name forwards to pnpm unparsed — oclif must not
	// reject unknown flags like --no-bail or --stream that pnpm consumes.
	static readonly strict = false;

	static readonly examples = [
		{
			description: "Run test:mocha in every workspace package (no filter set)",
			command: "<%= config.bin %> <%= command.id %> run test:mocha",
		},
		{
			description: "Scope to a specific package and its transitive dependents",
			command: `FLUID_PNPM_FILTER='--filter "@fluidframework/map..."' <%= config.bin %> <%= command.id %> run test:mocha`,
		},
	];

	async run(): Promise<void> {
		// Bypass oclif parsing — `this.argv` is the raw argv tail after the command
		// name, which is exactly what we want to forward to pnpm.
		const forwarded = this.argv;
		const filter = tokenizeFilter(process.env[FILTER_ENV_VAR] ?? "");
		const pnpmArgs = [...filter, ...forwarded];

		const code = await new Promise<number>((resolve) => {
			const child = spawn("pnpm", pnpmArgs, {
				stdio: "inherit",
				shell: false,
			});
			child.on("error", (err) => {
				this.warn(err.message);
				resolve(1);
			});
			child.on("exit", (c, signal) => {
				if (signal !== null) {
					resolve(128);
					return;
				}
				resolve(c ?? 1);
			});
		});

		if (code !== 0) {
			this.exit(code);
		}
	}
}
