/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Invokes pnpm with a workspace filter that can be overridden via the
 * FLUID_PNPM_FILTER environment variable. When the variable is unset or empty,
 * the script falls back to `-r` and behaves identically to `pnpm -r <args>` —
 * it runs the given command across every workspace package. CI jobs can set
 * FLUID_PNPM_FILTER to one or more `--filter "<pattern>"` fragments to
 * restrict execution to a subset of packages (for example, the set of packages
 * changed in a PR).
 *
 * Usage (from an npm script):
 *   "test:mocha": "node scripts/pnpm-run-scoped.cjs run --no-sort --stream --no-bail test:mocha --color"
 *
 * Expands to one of:
 *   pnpm -r run --no-sort --stream --no-bail test:mocha --color
 *   pnpm --filter "@fluidframework/map..." run --no-sort --stream --no-bail test:mocha --color
 */

"use strict";

const { spawn } = require("node:child_process");

// Split FLUID_PNPM_FILTER into argv tokens, preserving single- and double-quoted
// patterns as a single argument each. This lets callers write
//   FLUID_PNPM_FILTER='--filter "@fluidframework/map..." --filter "@fluidframework/tree..."'
// and have the two filter patterns arrive at pnpm as distinct argv entries.
function tokenizeFilter(input) {
	const trimmed = input.trim();
	if (trimmed === "") {
		return ["-r"];
	}
	const tokens = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match;
	while ((match = re.exec(trimmed)) !== null) {
		tokens.push(match[1] ?? match[2] ?? match[3]);
	}
	return tokens;
}

// Allow the wrapper to print what it would run without spawning pnpm. This is
// mainly for unit-testing and for troubleshooting pipeline jobs.
function main() {
	const forwardedArgs = process.argv.slice(2);
	const filterArgs = tokenizeFilter(process.env.FLUID_PNPM_FILTER ?? "");
	const pnpmArgs = [...filterArgs, ...forwardedArgs];

	if (process.env.FLUID_PNPM_FILTER_DRY_RUN === "1") {
		process.stdout.write(`pnpm ${pnpmArgs.join(" ")}\n`);
		return 0;
	}

	return new Promise((resolve) => {
		const child = spawn("pnpm", pnpmArgs, { stdio: "inherit", shell: false });
		child.on("error", (err) => {
			process.stderr.write(`${err.message}\n`);
			resolve(1);
		});
		child.on("exit", (code, signal) => {
			if (signal !== null) {
				resolve(128);
				return;
			}
			resolve(code ?? 1);
		});
	});
}

module.exports = { tokenizeFilter };

if (require.main === module) {
	Promise.resolve(main()).then((code) => process.exit(code));
}
