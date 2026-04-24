/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Checks the local developer environment for common configuration issues.
 * Run with: node scripts/check-dev-env.mjs
 * Or via: pnpm check:dev-env
 */

import { execSync } from "node:child_process";

const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const green = (s) => (useColor ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s) => (useColor ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s) => (useColor ? `\x1b[31m${s}\x1b[0m` : s);

/** Parsed output of `npm config list --json`, or `undefined` if the command failed. */
const npmConfig = (() => {
	try {
		const raw = execSync("npm config list --json", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
})();

const issues = [];
const warnings = [];
const results = [];

/** Records a check failure that must be resolved before the environment is usable. */
function issue(label, detail) {
	issues.push({ label, detail });
}

/** Records a check warning for something unexpected that may not cause immediate problems. */
function warn(label, detail) {
	warnings.push({ label, detail });
}

/** Records a passing check result. */
function pass(label) {
	results.push({ ok: true, label });
}

/**
 * Checks that the npm registry is set to the default and that no scoped registry overrides exist.
 *
 * @remarks
 * A custom top-level registry redirects all package installs to a different server, which can cause
 * resolution failures or pull packages from an untrusted source. Scoped overrides (`\@scope:registry`)
 * are less likely to break things but are not expected in this repo and worth surfacing.
 *
 * Both are read from `npm config list --json`, which merges all `.npmrc` layers (project, user, global).
 *
 * Examples of failure modes when this is misconfigured:
 * - Installing new dependencies fails with 401 errors if auth is not configured for the custom registry.
 * - Installing new dependencies might fail if a registry is pointing to an ADO feed because ADO feeds don't
 *   propagate provenance information for packages from npm, and our pnpm settings (trustPolicy=no-downgrade)
 *   might complain when seeing packages with no provenance info.
 */
function checkNpmRegistry() {
	if (npmConfig === undefined) {
		issue("npm registry", "Could not run 'npm config list --json' — is npm installed and on PATH?");
		return;
	}

	const registry = (npmConfig.registry ?? DEFAULT_REGISTRY).replace(/\/$/, "");
	const expected = DEFAULT_REGISTRY.replace(/\/$/, "");

	if (registry !== expected) {
		issue(
			"npm registry",
			`Custom registry detected: '${registry}'\n` +
				`     Expected the default: '${expected}'\n` +
				`     A non-default registry can cause package resolution failures.\n` +
				`     Fix: open your user-level .npmrc (~/.npmrc) and remove the registry line.`,
		);
	} else {
		pass("npm registry is the default");
	}

	const scopedRegistries = Object.entries(npmConfig)
		.filter(([key]) => /^@.+:registry$/.test(key))
		.map(([key, value]) => `'${key}' → '${value}'`);

	if (scopedRegistries.length > 0) {
		warn(
			"scoped registry overrides",
			`Unexpected scoped registries found in npm config (not expected for this repo):\n` +
				scopedRegistries.map((entry) => `        ${entry}`).join("\n") +
				`\n        These usually don't cause issues, but may redirect package resolution for those scopes.`,
		);
	} else {
		pass("no scoped registry overrides");
	}
}

/**
 * Checks that `NPM_CONFIG_REGISTRY` is not set in the environment.
 *
 * @remarks
 * npm (and pnpm) treat any `NPM_CONFIG_*` environment variable as a config override with higher
 * precedence than `.npmrc`. `NPM_CONFIG_REGISTRY` therefore silently overrides the registry for
 * every install, regardless of what `.npmrc` says. It is checked case-insensitively because shells
 * and CI systems set it in various cases.
 */
function checkEnvRegistry() {
	const key = Object.keys(process.env).find((k) => k.toLowerCase() === "npm_config_registry");
	if (key) {
		const value = process.env[key].replace(/\/$/, "");
		const expected = DEFAULT_REGISTRY.replace(/\/$/, "");
		if (value !== expected) {
			issue(
				"NPM_CONFIG_REGISTRY env var",
				`'${key}' is set to '${process.env[key]}'\n` +
					`     This overrides the registry for all npm/pnpm operations.\n` +
					`     Fix: unset it and/or remove it from your shell profile (e.g. ~/.bashrc, ~/.zshrc).`,
			);
		} else {
			pass("NPM_CONFIG_REGISTRY is set but points to the default registry");
		}
	} else {
		pass("NPM_CONFIG_REGISTRY is not set");
	}
}

/**
 * Checks for proxy settings that may interfere with package resolution.
 *
 * @remarks
 * Proxy configuration can come from two sources:
 * - **Environment variables** (`http_proxy`, `https_proxy`, `npm_config_proxy`,
 *   `npm_config_https_proxy`) — checked case-insensitively since conventions vary across shells
 *   and operating systems.
 * - **npm config** (`proxy`, `https-proxy`) — set via `.npmrc` files and visible in
 *   `npm config list --json`.
 *
 * Both are reported as warnings rather than errors because proxy settings may be legitimately
 * required in the developer's network environment.
 */
function checkProxySettings() {
	const proxyVarNames = ["http_proxy", "https_proxy", "npm_config_proxy", "npm_config_https_proxy"];
	const foundEnv = Object.keys(process.env)
		.filter((k) => proxyVarNames.includes(k.toLowerCase()))
		.map((k) => `'${k}'`);

	if (foundEnv.length > 0) {
		warn(
			"proxy environment variables",
			`The following proxy environment variables are set: ${foundEnv.join(", ")}\n` +
				`        These may redirect or block package resolution. If you are not on a network\n` +
				`        that requires a proxy, consider unsetting them in your shell profile.`,
		);
	} else {
		pass("no proxy environment variables set");
	}

	if (npmConfig !== undefined) {
		const foundConfig = ["proxy", "https-proxy"]
			.filter((key) => npmConfig[key] !== undefined && npmConfig[key] !== null && npmConfig[key] !== "")
			.map((key) => `'${key}'`);

		if (foundConfig.length > 0) {
			warn(
				"proxy settings in npm config",
				`The following proxy keys are set in npm config: ${foundConfig.join(", ")}\n` +
					`        These may redirect or block package resolution. If you are not on a network\n` +
					`        that requires a proxy, remove them from your user-level .npmrc (~/.npmrc).`,
			);
		} else {
			pass("no proxy settings in npm config");
		}
	}
}

// ---------------------------------------------------------------------------
// Run checks
// ---------------------------------------------------------------------------
console.log("Checking environment for known or suspected misconfigurations...\n");

checkNpmRegistry();
checkEnvRegistry();
checkProxySettings();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
for (const { label } of results) {
	console.log(`  ${green("[ok]")}  ${label}`);
}

if (warnings.length > 0) {
	console.log("");
	for (const { label, detail } of warnings) {
		console.warn(`  ${yellow("[warn]")} ${label}\n         ${detail}\n`);
	}
}

if (issues.length === 0) {
	console.log(warnings.length > 0 ? "All checks passed (with warnings)." : "\nAll checks passed.");
	process.exit(0);
}

console.log("");
for (const { label, detail } of issues) {
	console.error(`  ${red("[!!]")}  ${label}\n        ${detail}\n`);
}
console.error(`${issues.length} issue(s) found. Please resolve them before continuing.\n`);
process.exit(1);
