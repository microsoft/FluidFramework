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
 * working directory (matching the mapping written by the `assign-test-ports` bin). The resolved port is:
 *
 * - exported to the command's environment as `PORT`, and
 * - substituted into the command wherever a `{PORT}` token appears.
 *
 * This lets service tests that launch their own server (e.g. via `start-server-and-test`) run concurrently
 * across packages without colliding on a shared port, mirroring what jest/puppeteer tests already do via
 * `getTestPort`.
 *
 * @param argv - The command to run followed by its arguments. `{PORT}` tokens are replaced with the resolved port.
 * @returns The exit code of the spawned command.
 */
export function withTestPort(argv: readonly string[]): number {
	if (argv.length === 0) {
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

	// getTestPort returns a number; the environment variable and command substitution both need a string.
	const port = String(getTestPort(packageName));

	// Tokens have no embedded whitespace (script names / port numbers), so joining is safe.
	const command = argv.map((arg) => arg.split("{PORT}").join(port)).join(" ");

	const result = spawnSync(command, {
		stdio: "inherit",
		// shell is required so bins on the PATH (e.g. start-server-and-test) resolve cross-platform.
		shell: true,
		env: { ...process.env, PORT: port },
	});

	if (result.error !== undefined) {
		console.error(`with-test-port: failed to run "${command}": ${result.error.message}`);
		return 1;
	}

	// A process terminated by a signal reports a null status; surface that as a failure.
	return result.status ?? 1;
}
