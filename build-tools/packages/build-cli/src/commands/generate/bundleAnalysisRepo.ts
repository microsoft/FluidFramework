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
 * webpack-bundle-analyzer report is saved under `<analysis-dir>/<label>/analyzer.json` for later
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
				"Also used as the default label.",
			exclusive: ["merge-base"],
		}),
		"merge-base": Flags.string({
			description:
				"Collect a bundle for the merge-base of HEAD and this committish (the fork point). " +
				"Selects revision mode and is mutually exclusive with --revision. Also used as the " +
				"default label.",
			exclusive: ["revision"],
		}),
		label: Flags.string({
			description:
				"Override the directory name under which bundle stats are saved. Defaults to the " +
				'sanitized revision in revision mode, or a timestamped "current_<epoch>" in local mode.',
		}),
		"package-dir": Flags.string({
			description:
				"Package root whose webpack bundles are built and whose analyzer.json is collected.",
			default: ".",
		}),
		"analysis-dir": Flags.string({
			description:
				"Directory under which per-label analyzer stats are saved. Defaults to " +
				"<package-dir>/compareBundlesOutput/analysis.",
		}),
		"force-clean-build": Flags.boolean({
			description:
				"Run the full workspace clean ('npm run clean' at the repo root) before building. " +
				"Off by default; opt in when stale incremental build state from a previous revision " +
				"may interfere with the current one.",
			default: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;

		const packageDir = resolve(flags["package-dir"]);
		const analysisDir =
			flags["analysis-dir"] === undefined
				? resolve(packageDir, "compareBundlesOutput", "analysis")
				: resolve(flags["analysis-dir"]);

		const common = {
			label: flags.label,
			forceCleanBuild: flags["force-clean-build"],
			packageDir,
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
