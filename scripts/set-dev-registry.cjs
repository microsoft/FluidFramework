/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Points every pnpm workspace in this repo at an alternative npm registry (e.g. an internal
 * mirror or a team-managed Azure Artifacts feed) by writing a gitignored `.npmrc` into each
 * workspace root.
 *
 * The committed configuration intentionally uses the public default registry
 * (registry.npmjs.org) so that external/OSS contributions work out of the box. A value set in
 * `pnpm-workspace.yaml` would take precedence over `.npmrc`, so the committed workspace files do
 * NOT set a registry; this script provides the per-developer override instead.
 *
 * Because each release group (root, server/*, build-tools, website, common/*, tools/*, ...) is an
 * independent pnpm project and pnpm only reads the `.npmrc` from the project it is invoked in,
 * the override must be written into every workspace root.
 *
 * This script intentionally does NOT hard-code any registry URL: the URL is supplied as a
 * command-line argument so nothing internal is committed to this public repository.
 *
 * Usage:
 *   node ./scripts/set-dev-registry.cjs <registry-url>   Write the override into every workspace.
 *   node ./scripts/set-dev-registry.cjs --clear           Remove overrides written by this script.
 *
 * The generated `.npmrc` files are gitignored and carry a marker comment so `--clear` only
 * removes files this script created (it never touches an `.npmrc` you authored yourself).
 */

const fs = require("node:fs");
const path = require("node:path");

// Marker written as the first line of every generated .npmrc. Used by --clear to avoid deleting
// .npmrc files that a developer created for other purposes (e.g. auth tokens).
const MARKER =
	"; managed by scripts/set-dev-registry.cjs -- do not edit; run the script to change";

const repoRoot = path.resolve(__dirname, "..");

// Directory names that should never be traversed while discovering workspaces.
const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

/**
 * Recursively find every directory under `dir` that contains a `pnpm-workspace.yaml`, excluding
 * skipped directories above.
 * @param {string} dir Absolute directory to search.
 * @param {string[]} found Accumulator of absolute workspace-root paths.
 * @returns {string[]} `found`.
 */
function findWorkspaceRoots(dir, found) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return found;
	}

	if (entries.some((e) => e.isFile() && e.name === "pnpm-workspace.yaml")) {
		found.push(dir);
	}

	for (const entry of entries) {
		if (!entry.isDirectory() || SKIP_DIR_NAMES.has(entry.name)) {
			continue;
		}
		findWorkspaceRoots(path.join(dir, entry.name), found);
	}

	return found;
}

/**
 * Validate the provided registry URL, exiting the process with a helpful message if invalid.
 * @param {string} value Raw CLI argument.
 * @returns {string} The normalized registry URL (with a trailing slash).
 */
function parseRegistryUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		fail(`Invalid registry URL: "${value}". Provide an absolute http(s) URL.`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		fail(`Registry URL must use http(s), got "${url.protocol}" in "${value}".`);
	}
	// npm registries are conventionally referenced with a trailing slash.
	return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

/** Print an error + usage and exit non-zero. */
function fail(message) {
	console.error(`Error: ${message}\n`);
	printUsage();
	process.exit(1);
}

function printUsage() {
	console.error("Usage:");
	console.error(
		"  node ./scripts/set-dev-registry.cjs <registry-url>   Set the override in every workspace.",
	);
	console.error(
		"  node ./scripts/set-dev-registry.cjs --clear          Remove overrides created by this script.",
	);
}

function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		// No arguments is treated as an error so the script can never accidentally clear overrides.
		process.exit(args.length === 0 ? 1 : 0);
	}

	const clear = args.includes("--clear") || args.includes("-c");
	const positional = args.filter((a) => !a.startsWith("-"));

	if (clear && positional.length > 0) {
		fail("Do not pass a registry URL together with --clear.");
	}
	if (!clear && positional.length !== 1) {
		fail("Provide exactly one registry URL (or use --clear).");
	}

	const registry = clear ? undefined : parseRegistryUrl(positional[0]);
	const roots = findWorkspaceRoots(repoRoot, []);

	if (roots.length === 0) {
		fail("No pnpm workspaces found. Run this from within the FluidFramework repo.");
	}

	let changed = 0;
	for (const root of roots) {
		const npmrcPath = path.join(root, ".npmrc");
		const rel = path.relative(repoRoot, root) || ".";
		const existing = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, "utf8") : undefined;
		const managed = existing !== undefined && existing.startsWith(MARKER);

		if (clear) {
			if (existing === undefined) {
				continue;
			}
			if (!managed) {
				console.warn(`Skipping ${rel}/.npmrc (not managed by this script).`);
				continue;
			}
			fs.rmSync(npmrcPath);
			console.log(`Removed ${rel}/.npmrc`);
			changed++;
		} else {
			if (existing !== undefined && !managed) {
				console.warn(
					`Skipping ${rel}/.npmrc (already exists and is not managed by this script).`,
				);
				continue;
			}
			fs.writeFileSync(npmrcPath, `${MARKER}\nregistry=${registry}\n`);
			console.log(`Wrote ${rel}/.npmrc (registry=${registry})`);
			changed++;
		}
	}

	console.log(
		clear
			? `\nCleared registry override from ${changed} workspace(s).`
			: `\nSet registry override in ${changed} workspace(s).`,
	);
}

main();
