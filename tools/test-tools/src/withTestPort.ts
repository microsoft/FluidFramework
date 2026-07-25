/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { getTestPort } from "./getTestPort.js";

/**
 * Runs a command with the current package's assigned test port made available to it.
 *
 * @remarks
 * The port is resolved via {@link getTestPort} using the `name` field of the `package.json` in the current
 * working directory (matching the mapping written by the `assign-test-ports` bin), and substituted into the
 * command wherever a `{PORT}` token appears.
 *
 * This lets service tests that launch their own server (e.g. via `start-server-and-test`) run concurrently
 * across packages without colliding on a shared port, mirroring what jest/puppeteer tests already do via
 * `getTestPort`.
 *
 * @param argv - The command to run followed by its arguments. An optional leading `--fallback <number>`
 * option sets the port used when `assign-test-ports` has not been run (see {@link getTestPort}); it should
 * match the default port the launched server uses so the server and any test client stay in agreement.
 * `{PORT}` tokens in the remaining arguments are replaced with the resolved port.
 * @returns The exit code of the spawned command.
 */
export function withTestPort(argv: readonly string[]): number {
	// An optional leading "--fallback <number>" option controls the port used when no assigned port is
	// found (no mapping file, or no entry for the package). It should match the default port the launched
	// server uses so the server and any test client resolve the same port.
	let fallbackPort: number | undefined;
	let commandArgv: readonly string[] = argv;
	if (commandArgv[0] === "--fallback") {
		const value = commandArgv[1];
		const parsed = value === undefined ? Number.NaN : Number.parseInt(value, 10);
		if (Number.isNaN(parsed)) {
			console.error("with-test-port: --fallback requires a numeric value.");
			return 1;
		}
		fallbackPort = parsed;
		commandArgv = commandArgv.slice(2);
	}

	if (commandArgv.length === 0) {
		console.error("with-test-port: no command was provided to run.");
		return 1;
	}

	const packageJsonPath = path.resolve(process.cwd(), "package.json");
	let packageName: string;
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
			name?: string;
		};
		if (packageJson.name === undefined) {
			throw new Error(`missing "name" field in ${packageJsonPath}`);
		}
		packageName = packageJson.name;
	} catch (error) {
		console.error(
			`with-test-port: unable to determine the package name: ${(error as Error).message}`,
		);
		return 1;
	}

	// getTestPort returns a number; command substitution needs a string.
	const port = String(getTestPort(packageName, fallbackPort));

	// Tokens have no embedded whitespace (script names / port numbers), so joining is safe.
	const command = commandArgv.map((arg) => arg.split("{PORT}").join(port)).join(" ");

	const result = spawnSync(command, {
		stdio: "inherit",
		// shell is required so bins on the PATH (e.g. start-server-and-test) resolve cross-platform.
		shell: true,
	});

	if (result.error !== undefined) {
		console.error(`with-test-port: failed to run "${command}": ${result.error.message}`);
		return 1;
	}

	// A process terminated by a signal reports a null status; surface that as a failure.
	return result.status ?? 1;
}
