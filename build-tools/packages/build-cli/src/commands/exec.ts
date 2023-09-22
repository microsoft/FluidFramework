/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Package } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
import execa from "execa";

import { PackageCommand } from "../BasePackageCommand";

export default class ExecCommand extends PackageCommand<typeof ExecCommand> {
	static description = `Run a shell command in the context of a package or release group.`;

	static args = {
		cmd: Args.string({
			description: "The shell command to execute.",
			required: true,
		}),
	};

	protected async processPackage(pkg: Package): Promise<void> {
		// TODO: The shell option should not need to be true. AB#4067
		const result = await execa.command(this.args.cmd, {
			cwd: pkg.directory,
			stdio: "inherit",
			shell: true,
		});
		this.log(result.all);
	}
}
