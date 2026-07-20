/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Installs the repo's pinned pnpm version globally via `npm install -g`, bypassing Corepack.
 *
 * Why not Corepack? When a registry override is configured, Corepack fetches package managers from
 * the npm "packument-by-version" endpoint (`GET {registry}/pnpm/{version}`), which the internal npm
 * mirror and Azure Artifacts feeds do NOT implement (they return 404). `npm install` instead uses
 * the packument (`GET {registry}/pnpm`) and tarball (`GET {registry}/pnpm/-/pnpm-{version}.tgz`)
 * endpoints, which those feeds DO serve. On managed devices the public registry is blocked, and CI
 * runs under network isolation, so both need this npm-based bootstrap.
 *
 * CI and internal developers share this script so the bootstrap logic lives in exactly one place.
 * It intentionally hard-codes no registry URL: the registry comes from `--registry`, the `.npmrc`
 * referenced by `--userconfig`, or the ambient npm configuration.
 *
 * The pinned version is read from the `packageManager` field of a package.json (the workspace's own
 * by default), so it always matches what the repo expects.
 *
 * Usage:
 *   node ./scripts/bootstrap-pnpm.cjs [options]
 *
 * Options:
 *   --registry <url>        Registry to install pnpm from (forwarded to `npm install --registry`).
 *   --userconfig <path>     .npmrc to use (forwarded to `npm install --userconfig`); used by CI.
 *   --package-json <path>   package.json to read the pinned pnpm version from (default: ./package.json).
 *   --dry-run               Print the npm command that would run, without executing it.
 *   --help, -h              Show this help.
 *
 * Note for local developers: if you previously ran `corepack enable`, the Corepack pnpm shim may
 * shadow this global install. Run `corepack disable pnpm` so the npm-installed pnpm is used.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function printUsage() {
	console.error("Usage: node ./scripts/bootstrap-pnpm.cjs [--registry <url>] [--userconfig <path>] [--package-json <path>] [--dry-run]");
}

function fail(message) {
	console.error(`Error: ${message}\n`);
	printUsage();
	process.exit(1);
}

/**
 * Parse a `--flag value` style option out of argv.
 * @param {string[]} argv
 * @param {string} name Flag name including leading dashes (e.g. "--registry").
 * @returns {string | undefined}
 */
function takeOption(argv, name) {
	const index = argv.indexOf(name);
	if (index === -1) {
		return undefined;
	}
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("-")) {
		fail(`Missing value for ${name}.`);
	}
	argv.splice(index, 2);
	return value;
}

/**
 * Read the pinned pnpm spec (e.g. "pnpm@11.12.0") from a package.json's `packageManager` field,
 * discarding the integrity hash suffix (npm provides no practical way to consume it).
 * @param {string} packageJsonPath
 * @returns {string}
 */
function readPinnedPnpmSpec(packageJsonPath) {
	let pkg;
	try {
		pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
	} catch (err) {
		fail(`Could not read ${packageJsonPath}: ${err.message}`);
	}
	const field = pkg.packageManager;
	if (typeof field !== "string" || field.length === 0) {
		fail(`No "packageManager" field found in ${packageJsonPath}.`);
	}
	// "pnpm@11.12.0+sha512.<hash>" -> "pnpm@11.12.0"
	const spec = field.split("+")[0];
	if (!spec.startsWith("pnpm@")) {
		fail(`"packageManager" is "${field}", but this script only bootstraps pnpm.`);
	}
	return spec;
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--help") || argv.includes("-h")) {
		printUsage();
		process.exit(0);
	}

	const registry = takeOption(argv, "--registry");
	const userconfig = takeOption(argv, "--userconfig");
	const packageJsonArg = takeOption(argv, "--package-json");
	const dryRunIndex = argv.indexOf("--dry-run");
	const dryRun = dryRunIndex !== -1;
	if (dryRun) {
		argv.splice(dryRunIndex, 1);
	}
	if (argv.length > 0) {
		fail(`Unrecognized argument(s): ${argv.join(", ")}`);
	}

	if (registry !== undefined) {
		try {
			const url = new URL(registry);
			if (url.protocol !== "http:" && url.protocol !== "https:") {
				fail(`--registry must be an http(s) URL, got "${registry}".`);
			}
		} catch {
			fail(`--registry must be a valid URL, got "${registry}".`);
		}
	}

	const packageJsonPath = path.resolve(packageJsonArg ?? path.join(process.cwd(), "package.json"));
	const spec = readPinnedPnpmSpec(packageJsonPath);

	const npmArgs = ["install", "-g", spec];
	if (userconfig !== undefined) {
		npmArgs.push("--userconfig", userconfig);
	}
	if (registry !== undefined) {
		npmArgs.push("--registry", registry);
	}

	// On Windows the npm executable is a .cmd shim.
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

	console.log(`Bootstrapping ${spec} (pinned in ${packageJsonPath})`);
	console.log(`> ${npmCommand} ${npmArgs.join(" ")}`);

	if (dryRun) {
		console.log("(dry run: not executing)");
		return;
	}

	const result = spawnSync(npmCommand, npmArgs, { stdio: "inherit" });
	if (result.error) {
		fail(`Failed to run npm: ${result.error.message}`);
	}
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
	console.log(`\nInstalled ${spec}. If a Corepack pnpm shim shadows it, run 'corepack disable pnpm'.`);
}

main();
