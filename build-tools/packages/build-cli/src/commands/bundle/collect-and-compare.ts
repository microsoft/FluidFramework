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
export default class BundleCollectAndCompare extends BaseCommand<
	typeof BundleCollectAndCompare
> {
	public static readonly description =
		"Collect the local bundle and the base-revision (merge-base) bundle, then compare them. " +
		"The outer repo's working tree, branch, and stash are never modified.\n\n" +
		"To learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleDetails.md";

	public static readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --base-revision main",
		"<%= config.bin %> <%= command.id %> --base-revision client_v2.100.0",
		"<%= config.bin %> <%= command.id %> --base-revision 18062854f25 --exact-base",
		"<%= config.bin %> <%= command.id %> --force-clean-build --keep-base-repo",
	];

	public static readonly flags = {
		"base-revision": Flags.string({
			description:
				"Revision to use as the comparison baseline (branch, tag, or commit SHA). The " +
				"actual base used is the merge-base of HEAD and this revision (the fork point), so " +
				"worktree-based setups where 'main' is in an unusual location still produce the " +
				"expected comparison. Pass --exact-base to use the revision as-is instead.",
			default: "main",
		}),
		"exact-base": Flags.boolean({
			description:
				"Use --base-revision exactly as given (resolved via 'git rev-parse') instead of taking " +
				"the merge-base with HEAD. Useful for comparing the working tree against a specific " +
				"commit, e.g. the current commit's parent.",
			default: false,
		}),
		"package-dir": Flags.string({
			description: "Package root whose webpack bundles are built and compared.",
			default: ".",
		}),
		"analysis-dir": Flags.string({
			description:
				"Directory under which per-label analyzer stats are saved. Defaults to an " +
				"'analysis' subdirectory of the output directory (e.g. " +
				"<package-dir>/compareBundlesOutput/analysis).",
		}),
		"output-dir": Flags.string({
			description:
				"Directory where the comparison reports are written. Defaults to " +
				"<package-dir>/compareBundlesOutput.",
		}),
		"force-clean-build": Flags.boolean({
			description:
				"Run the full workspace clean before each build. Off by default; opt in when stale " +
				"incremental build state may interfere with the current revision.",
			default: false,
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
		const outputDir =
			flags["output-dir"] === undefined
				? resolve(packageDir, "compareBundlesOutput")
				: resolve(flags["output-dir"]);
		const analysisDir =
			flags["analysis-dir"] === undefined
				? resolve(outputDir, "analysis")
				: resolve(flags["analysis-dir"]);

		await collectAndCompareBundles({
			baseRevision: flags["base-revision"],
			exactBase: flags["exact-base"],
			forceCleanBuild: flags["force-clean-build"],
			keepBaseRepo: flags["keep-base-repo"],
			packageDir,
			analysisDir,
			outputDir,
		});
	}
}
