/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { tokenizeFilter } = require("./pnpm-run-scoped.cjs");

const scriptPath = path.join(__dirname, "pnpm-run-scoped.cjs");

function runDryRun(env, args) {
	return execFileSync(process.execPath, [scriptPath, ...args], {
		env: { ...process.env, FLUID_PNPM_FILTER_DRY_RUN: "1", ...env },
		encoding: "utf8",
	}).trim();
}

// tokenizeFilter unit tests
assert.deepEqual(tokenizeFilter(""), ["-r"], "empty string defaults to -r");
assert.deepEqual(tokenizeFilter("   "), ["-r"], "whitespace-only defaults to -r");
assert.deepEqual(
	tokenizeFilter('--filter "@fluidframework/map..."'),
	["--filter", "@fluidframework/map..."],
	"single quoted filter",
);
assert.deepEqual(
	tokenizeFilter('--filter "@fluidframework/map..." --filter "@fluidframework/tree..."'),
	["--filter", "@fluidframework/map...", "--filter", "@fluidframework/tree..."],
	"multiple quoted filters",
);
assert.deepEqual(
	tokenizeFilter("--filter @fluidframework/map"),
	["--filter", "@fluidframework/map"],
	"unquoted filter",
);

// Dry-run integration tests — these verify the final argv handed to pnpm.
assert.equal(
	runDryRun({}, ["run", "--no-sort", "--stream", "--no-bail", "test:mocha", "--color"]),
	"pnpm -r run --no-sort --stream --no-bail test:mocha --color",
	"unset env var → -r prepended",
);

assert.equal(
	runDryRun({ FLUID_PNPM_FILTER: "" }, ["run", "test:mocha"]),
	"pnpm -r run test:mocha",
	"empty env var → -r prepended",
);

assert.equal(
	runDryRun({ FLUID_PNPM_FILTER: '--filter "@fluidframework/map..."' }, [
		"run",
		"--no-bail",
		"test:mocha",
	]),
	"pnpm --filter @fluidframework/map... run --no-bail test:mocha",
	"env var with one quoted filter",
);

assert.equal(
	runDryRun(
		{
			FLUID_PNPM_FILTER:
				'--filter "@fluidframework/map..." --filter "@fluidframework/tree..."',
		},
		["run", "test:mocha"],
	),
	"pnpm --filter @fluidframework/map... --filter @fluidframework/tree... run test:mocha",
	"env var with multiple filters",
);

console.log("OK — all pnpm-run-scoped tests passed");
