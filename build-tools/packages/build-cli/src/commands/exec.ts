/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Package } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
import execa from "execa";

import { PackageCommand } from "../BasePackageCommand.js";
import type { PackageSelectionDefault } from "../flags.js";

export default class ExecCommand extends PackageCommand<typeof ExecCommand> {
	static readonly description =
		`Run a shell command in the context of a package or release group.`;

	static readonly args = {
		cmd: Args.string({
			description: "The shell command to execute.",
			required: true,
		}),
	} as const;

	protected defaultSelection = "all" as PackageSelectionDefault;

	protected async processPackage(pkg: Package): Promise<void> {
		// TODO: The shell option should not need to be true. AB#4067
		// Capture the command's combined stdout/stderr (via `all`) instead of inheriting the parent process's stdio.
		// When running a command across many packages concurrently, inheriting stdio interleaves each package's output
		// into an unreadable mess (and corrupts the progress spinner). Capturing it means that, on success, the output
		// is only shown in verbose mode, and on failure execa includes the captured output in the thrown error so the
		// full context is reported by the command's error summary.
		const result = await execa.command(this.args.cmd, {
			cwd: pkg.directory,
			all: true,
			shell: true,
		});
		if (result.all !== undefined && result.all !== "") {
			this.verbose(`Output from ${pkg.name}:\n${result.all}`);
		}
	}
}
