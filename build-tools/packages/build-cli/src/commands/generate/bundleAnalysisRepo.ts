/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { resolve } from "node:path";
import { Flags } from "@oclif/core";

import { collectBundle } from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Builds and collects a single bundle, either from the outer enlistment (local mode) or from a
 * separate inner enlistment checked out to a specific revision (revision mode). The collected
 * webpack-bundle-analyzer report is saved under
 * `<package-dir>/compareBundlesOutput/analysis/<label>/analyzer.json` for later
 * comparison by `flub check bundleAnalysisReposComparison`.
 */
export default class GenerateBundleAnalysisRepo extends BaseCommand<
	typeof GenerateBundleAnalysisRepo
> {
	public static readonly description =
		"Build and collect a bundle, either from the outer enlistment (local mode) or from a " +
		"separate inner enlistment checked out to a specific revision (revision mode). The outer " +
		"repo's working tree, branch, and stash are never modified.\n\n" +
		"To learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleAnalysisRepoDetails.md";

	public static readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --revision main",
		"<%= config.bin %> <%= command.id %> --merge-base main",
		"<%= config.bin %> <%= command.id %> --revision client_v2.100.0",
	];

	public static readonly flags = {
		revision: Flags.string({
			description:
				"Collect a bundle for this committish (branch, tag, commit SHA, or any committish " +
				"like HEAD~2), resolved as-is via 'git rev-parse'. Selects revision mode and is " +
				"mutually exclusive with --merge-base; omit both to collect the local working tree. " +
				"Also used as the label (the subdirectory name the bundle's stats are saved under).",
			exclusive: ["merge-base"],
		}),
		"merge-base": Flags.string({
			description:
				"Collect a bundle for the merge-base of HEAD and this committish (the fork point). " +
				"Selects revision mode and is mutually exclusive with --revision. Also used as the " +
				"label (the subdirectory name the bundle's stats are saved under).",
			exclusive: ["revision"],
		}),
		"package-dir": Flags.string({
			description:
				"Package root whose 'build:compile' is run to compile the package and its dependencies.",
			default: ".",
		}),
		"webpack-dir": Flags.string({
			description:
				"Directory whose 'webpack' build is run and whose analyzer.json is collected. Defaults " +
				"to --package-dir. Set this when the webpack config lives in a different directory than " +
				"the package being compiled (e.g. a scenario subdirectory that reuses its parent " +
				"package's compiled output). The collected stats are saved under this directory's " +
				"compareBundlesOutput.",
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;

		const packageDir = resolve(flags["package-dir"]);
		const webpackDir = resolve(flags["webpack-dir"] ?? flags["package-dir"]);
		const analysisDir = resolve(webpackDir, "compareBundlesOutput", "analysis");

		const common = {
			forceCleanBuild: false,
			packageDir,
			webpackDir,
			analysisDir,
		};

		// The presence of --revision/--merge-base (mutually exclusive) selects revision
		// mode and how the committish is resolved; with neither, collect the local working tree.
		const exactRevision = flags.revision;
		const mergeBaseRevision = flags["merge-base"];
		if (exactRevision !== undefined) {
			await collectBundle({ ...common, mode: "revision", revision: exactRevision });
		} else if (mergeBaseRevision !== undefined) {
			await collectBundle({ ...common, mode: "revision", mergeBaseOf: mergeBaseRevision });
		} else {
			await collectBundle({ ...common, mode: "local" });
		}
	}
}
