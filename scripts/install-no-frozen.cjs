/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { spawnSync } = require("node:child_process");

const pnpm = process.env.npm_execpath;
if (pnpm === undefined) {
	console.error("Run this script with pnpm run install-no-frozen.");
	process.exit(1);
}

const args = process.argv.slice(2);
const registryArgs = [];
for (let index = 0; index < args.length; index++) {
	const arg = args[index];
	if (arg === "--registry" || arg === "--config.registry") {
		if (args[index + 1] === undefined || args[index + 1].startsWith("--")) {
			console.error(`${arg} requires a registry URL.`);
			process.exit(1);
		}
		registryArgs.push("--config.registry", args[++index]);
	} else if (arg.startsWith("--registry=")) {
		registryArgs.push(arg.replace("--registry=", "--config.registry="));
	} else if (arg.startsWith("--config.registry=")) {
		registryArgs.push(arg);
	}
}

const config = spawnSync(
	process.execPath,
	[pnpm, "config", "get", "registry", ...registryArgs],
	{
		encoding: "utf8",
		stdio: ["inherit", "pipe", "inherit"],
	},
);
if (config.error !== undefined) {
	console.error(config.error);
	process.exit(1);
}
if (config.status !== 0) {
	process.exit(config.status ?? 1);
}

const registry = new URL(config.stdout.trim());
const normalizedRegistry = registry.href.replace(/\/$/, "");
let minimumReleaseAge;
if (normalizedRegistry === "https://registry.npmjs.org") {
	minimumReleaseAge = 10080;
} else if (
	normalizedRegistry ===
	"https://pkgs.dev.azure.com/fluidframework/public/_packaging/publicPackages/npm/registry"
) {
	minimumReleaseAge = 0;
}

const installArgs = ["install", "--no-frozen-lockfile", ...args];
if (minimumReleaseAge !== undefined) {
	installArgs.push(`--config.minimum-release-age=${minimumReleaseAge}`);
}
const install = spawnSync(process.execPath, [pnpm, ...installArgs], { stdio: "inherit" });
if (install.error !== undefined) {
	console.error(install.error);
	process.exit(1);
}
process.exit(install.status ?? 1);
