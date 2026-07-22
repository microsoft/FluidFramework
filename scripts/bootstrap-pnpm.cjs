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
 *   --seed-corepack         After installing, seed Corepack's cache with the pinned version so that
 *                           developers can keep `corepack enable`d (see below).
 *   --dry-run               Print what would run, without executing it.
 *   --help, -h              Show this help.
 *
 * Note for local developers: if you previously ran `corepack enable`, the Corepack pnpm shim may
 * shadow this global install. Run `corepack disable pnpm` so the npm-installed pnpm is used, OR pass
 * `--seed-corepack` and keep Corepack enabled (recommended if you juggle multiple repos).
 *
 * How --seed-corepack works: Corepack only reaches for its (feed-unsupported) download endpoint on a
 * cache MISS. If `<COREPACK_HOME>/v1/pnpm/<version>/.corepack` already exists it reuses that copy
 * offline. So after `npm install` fetches pnpm, this script copies it into that cache folder and
 * writes the `.corepack` metadata Corepack expects. Corepack then runs the pinned version with no
 * network. This only covers the seeded version; other (unseeded) versions still can't be fetched.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const isWindows = process.platform === "win32";

/**
 * Quote a single argument for a Windows cmd.exe command line (only used on Windows).
 * @param {unknown} value
 * @returns {string}
 */
function quoteWindowsArg(value) {
	const str = String(value);
	return /[\s"&|<>^()%!]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Run npm cross-platform. On Windows the npm executable is a `.cmd` shim, which recent Node versions
 * refuse to spawn without a shell; we build a single quoted command line to avoid that restriction
 * (and the arg-escaping deprecation warning that comes with `shell: true` plus an args array).
 * @param {string[]} args
 * @param {{ capture?: boolean }} [options]
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
function runNpm(args, { capture = false } = {}) {
	const io = capture ? { encoding: "utf8" } : { stdio: "inherit" };
	if (isWindows) {
		const line = ["npm.cmd", ...args.map(quoteWindowsArg)].join(" ");
		return spawnSync(line, { shell: true, ...io });
	}
	return spawnSync("npm", args, io);
}

function printUsage() {
	console.error("Usage: node ./scripts/bootstrap-pnpm.cjs [--registry <url>] [--userconfig <path>] [--package-json <path>] [--seed-corepack] [--dry-run]");
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

/**
 * Resolve Corepack's cache home, matching Corepack's own getCorepackHomeFolder() logic so we seed
 * the exact folder it reads from.
 * @returns {string}
 */
function getCorepackHomeFolder() {
	if (process.env.COREPACK_HOME) {
		return process.env.COREPACK_HOME;
	}
	const base =
		process.env.XDG_CACHE_HOME ??
		process.env.LOCALAPPDATA ??
		path.join(os.homedir(), process.platform === "win32" ? "AppData/Local" : ".cache");
	return path.join(base, "node/corepack");
}

/**
 * Best-effort lookup of the pnpm tarball's sha512 integrity, converted to the `sha512.<hex>` form
 * Corepack stores. Corepack does not re-verify this on the cache-reuse path, so a placeholder is
 * acceptable when the registry can't be reached.
 * @param {string} version
 * @param {string | undefined} registry
 * @param {string | undefined} userconfig
 * @returns {string}
 */
function getTarballHash(version, registry, userconfig) {
	const placeholder = `sha512.${"0".repeat(128)}`;
	// Fail fast to the placeholder rather than stalling on npm's retry/backoff if the registry is
	// briefly unreachable; the hash is not verified on Corepack's reuse path anyway.
	const args = ["view", `pnpm@${version}`, "dist.integrity", "--fetch-retries=0"];
	if (userconfig !== undefined) {
		args.push("--userconfig", userconfig);
	}
	if (registry !== undefined) {
		args.push("--registry", registry);
	}
	const result = runNpm(args, { capture: true });
	const integrity = (result.stdout ?? "").trim();
	if (!integrity.startsWith("sha512-")) {
		console.warn("Warning: could not resolve pnpm tarball integrity; using a placeholder hash for the Corepack cache (this does not affect correctness).");
		return placeholder;
	}
	const hex = Buffer.from(integrity.slice("sha512-".length), "base64").toString("hex");
	return `sha512.${hex}`;
}

/**
 * Seed Corepack's cache with an already npm-installed pnpm so Corepack reuses it offline.
 * @param {string} version
 * @param {string | undefined} registry
 * @param {string | undefined} userconfig
 * @param {boolean} dryRun
 */
function seedCorepackCache(version, registry, userconfig, dryRun) {
	const rootResult = runNpm(["root", "-g"], { capture: true });
	if (rootResult.status !== 0) {
		fail(`Could not determine the npm global root: ${(rootResult.stderr ?? "").trim()}`);
	}
	const pnpmPackageDir = path.join((rootResult.stdout ?? "").trim(), "pnpm");
	const pnpmPackageJson = path.join(pnpmPackageDir, "package.json");
	if (!fs.existsSync(pnpmPackageJson)) {
		fail(`Expected pnpm at ${pnpmPackageDir} after install, but it was not found.`);
	}
	// Corepack launches the binary named in .corepack; reuse pnpm's own bin map so it stays correct
	// across pnpm versions (e.g. .cjs vs .mjs).
	const bin = JSON.parse(fs.readFileSync(pnpmPackageJson, "utf8")).bin;

	const versionDir = path.join(getCorepackHomeFolder(), "v1", "pnpm", version);
	const marker = path.join(versionDir, ".corepack");

	if (fs.existsSync(marker)) {
		console.log(`Corepack cache already seeded at ${versionDir}`);
		return;
	}
	if (dryRun) {
		console.log(`(dry run) would seed Corepack cache at ${versionDir}`);
		return;
	}

	const hash = getTarballHash(version, registry, userconfig);
	// Copy into a temp sibling then rename, so a valid .corepack only ever appears on a complete copy.
	const tmpDir = `${versionDir}.tmp-${process.pid}`;
	fs.rmSync(tmpDir, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(versionDir), { recursive: true });
	fs.cpSync(pnpmPackageDir, tmpDir, { recursive: true });
	fs.writeFileSync(
		path.join(tmpDir, ".corepack"),
		JSON.stringify({ locator: { name: "pnpm", reference: version }, bin, hash }),
	);
	fs.rmSync(versionDir, { recursive: true, force: true });
	fs.renameSync(tmpDir, versionDir);

	console.log(`Seeded Corepack cache at ${versionDir}. You can keep 'corepack enable'd.`);
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
	const seedCorepackIndex = argv.indexOf("--seed-corepack");
	const seedCorepack = seedCorepackIndex !== -1;
	if (seedCorepack) {
		argv.splice(seedCorepackIndex, 1);
	}
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

	console.log(`Bootstrapping ${spec} (pinned in ${packageJsonPath})`);
	console.log(`> npm ${npmArgs.join(" ")}`);

	if (dryRun) {
		console.log("(dry run: not executing)");
		if (seedCorepack) {
			seedCorepackCache(spec.slice("pnpm@".length), registry, userconfig, true);
		}
		return;
	}

	const result = runNpm(npmArgs);
	if (result.error) {
		fail(`Failed to run npm: ${result.error.message}`);
	}
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}

	if (seedCorepack) {
		seedCorepackCache(spec.slice("pnpm@".length), registry, userconfig, false);
		console.log(`\nInstalled and seeded ${spec}.`);
	} else {
		console.log(`\nInstalled ${spec}. If a Corepack pnpm shim shadows it, run 'corepack disable pnpm'.`);
	}
}

main();
