/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { execAsync } from "@fluidframework/build-tools";
import { Args, Flags } from "@oclif/core";
import { PackageCommand } from "../BasePackageCommand";

export default class ExecCommand extends PackageCommand<typeof ExecCommand> {
	static description = `Run a shell command in the context of a package or release group.`;

	static args = {
		execCmd: Args.string({
			description: "The shell command to execute.",
			required: true,
		}),
	};

	static flags = {
		all: Flags.boolean({
			char: "a",
			description:
				"Run on all packages and release groups. Cannot be used with --releaseGroup, --packages, or --dir.",
			exclusive: ["dir", "packages", "releaseGroup"],
		}),
		roots: Flags.boolean({
			description:
				"Runs only on the root package of release groups. Can only be used with --all.",
			dependsOn: ["all"],
		}),
		...PackageCommand.flags,
	};

	protected async processPackage(directory: string): Promise<void> {
		// this.log(`DIR: ${directory}`);
		const result = await execAsync(this.args.execCmd, { cwd: directory });
		this.log(result.stdout);
	}

	public async run(): Promise<void> {
		const ctx = await this.getContext();
		const flags = this.flags;
		if (flags.all) {
			const releaseGroups = [...ctx.repo.releaseGroups.entries()].map(async (item) => {
				const [rg, rgRepo] = item;
				return flags.roots
					? this.processPackages([rgRepo.repoPath])
					: this.processReleaseGroup(rg);
			});
			await Promise.all([
				...releaseGroups,
				this.processPackages(ctx.independentPackages.map((p) => p.directory)),
			]);
			return;
		}

		return super.run();
	}
}
