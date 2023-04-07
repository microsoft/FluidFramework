/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execAsync } from "@fluidframework/build-tools";
import { Args } from "@oclif/core";
import { PackageCommand } from "../BasePackageCommand";

export default class ExecCommand extends PackageCommand<typeof ExecCommand> {
	static description = `Run a shell command in the context of a package or release group.`;

	static args = {
		cmd: Args.string({
			description: "The shell command to execute.",
			required: true,
		}),
	};

	protected async processPackage(directory: string): Promise<void> {
		const result = await execAsync(this.args.cmd, { cwd: directory });
		this.log(result.stdout);
	}
}
