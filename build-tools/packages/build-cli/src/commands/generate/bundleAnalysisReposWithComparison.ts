/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { resolve } from "node:path";
import { Flags } from "@oclif/core";

import { collectAndCompareBundles } from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Orchestrates a local bundle collection, a base-revision (merge-base) bundle collection, and a
 * comparison between them. The outer repo's working tree, branch, and stash are never modified.
 */
export default class GenerateBundleAnalysisReposWithComparison extends BaseCommand<
	typeof GenerateBundleAnalysisReposWithComparison
> {
	public static readonly description =
		"Collect the local bundle and the base-revision (merge-base) bundle, then compare them. " +
		"The outer repo's working tree, branch, and stash are never modified.\n\n" +
		"To learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleAnalysisRepoDetails.md";

	public static readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --base-revision main",
		"<%= config.bin %> <%= command.id %> --base-revision client_v2.100.0",
		"<%= config.bin %> <%= command.id %> --base-revision 18062854f25 --exact-base",
		"<%= config.bin %> <%= command.id %> --keep-base-repo",
	];

	public static readonly flags = {
		"base-revision": Flags.string({
			description:
				"Revision to use as the comparison baseline (branch, tag, or commit SHA). The " +
				"actual base used is the merge-base of HEAD and this revision (the fork point), so " +
				"worktree-based setups where 'main' is in an unusual location still produce the " +
				"expected comparison. When omitted, the baseline is auto-detected as the freshest " +
				"'main' of a remote pointing at microsoft/FluidFramework — the local 'main' is not " +
				"used, since it may be stale. An explicit value (including 'main') is always honored " +
				"as given. Pass --exact-base to use the revision as-is instead.",
			// No default: an omitted base-revision triggers freshest-remote 'main' auto-detection.
		}),
		"exact-base": Flags.boolean({
			description:
				"Use --base-revision exactly as given (resolved via 'git rev-parse') instead of taking " +
				"the merge-base with HEAD. Useful for comparing the working tree against a specific " +
				"commit, e.g. the current commit's parent.",
			default: false,
		}),
		"package-dir": Flags.string({
			description:
				"Package root whose 'build:compile' is run to compile the package and its dependencies.",
			default: ".",
		}),
		"webpack-dir": Flags.string({
			description:
				"Directory whose 'webpack' build is run and compared. Defaults to --package-dir. Set " +
				"this when the webpack config lives in a different directory than the package being " +
				"compiled (e.g. a scenario subdirectory). The comparison reports are written under this " +
				"directory's compareBundlesOutput.",
		}),
		"keep-base-repo": Flags.boolean({
			description:
				"For debugging only: keep the inner base-repo clone after collecting the base " +
				"bundle. By default the inner repo is deleted once stats are saved, since it can be " +
				"re-created cheaply via shallow clone on the next run. Pass this flag to inspect the " +
				"inner repo's working tree or build output (e.g. when a build is failing inside the " +
				"inner repo).",
			default: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;

		const packageDir = resolve(flags["package-dir"]);
		const webpackDir = resolve(flags["webpack-dir"] ?? flags["package-dir"]);
		const outputDir = resolve(webpackDir, "compareBundlesOutput");
		const analysisDir = resolve(outputDir, "analysis");

		await collectAndCompareBundles({
			baseRevision: flags["base-revision"],
			exactBase: flags["exact-base"],
			forceCleanBuild: false,
			keepBaseRepo: flags["keep-base-repo"],
			packageDir,
			webpackDir,
			analysisDir,
			outputDir,
		});
	}
}
