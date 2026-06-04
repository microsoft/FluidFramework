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
 * comparison by `flub bundle compare`.
 */
export default class BundleCollect extends BaseCommand<typeof BundleCollect> {
	public static readonly description =
		"Build and collect a bundle, either from the outer enlistment (local mode) or from a " +
		"separate inner enlistment checked out to a specific revision (revision mode). The outer " +
		"repo's working tree, branch, and stash are never modified.";

	public static readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --mode revision --revision main",
		"<%= config.bin %> <%= command.id %> --mode revision --revision client_v2.100.0",
	];

	public static readonly flags = {
		mode: Flags.string({
			description:
				"local: collect from the outer enlistment. revision: collect from a separate " +
				"inner enlistment checked out at --revision.",
			options: ["local", "revision"] as const,
			default: "local",
		}),
		revision: Flags.string({
			description:
				"(revision mode only, required) Branch, tag, or commit SHA to check out in the " +
				"inner repo before building. Also used as the default label.",
		}),
		label: Flags.string({
			description:
				"Override the directory name under which bundle stats are saved. Defaults to the " +
				'sanitized revision in revision mode, or "current" in local mode.',
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

		const mode = flags.mode as "local" | "revision";
		const { revision } = flags;
		if (mode === "revision" && (revision === undefined || revision.length === 0)) {
			this.error("--mode revision requires --revision <rev>.", { exit: 1 });
		}

		const packageDir = resolve(flags["package-dir"]);
		const analysisDir =
			flags["analysis-dir"] === undefined
				? resolve(packageDir, "compareBundlesOutput", "analysis")
				: resolve(flags["analysis-dir"]);
		const label = flags.label ?? (mode === "revision" ? (revision as string) : "current");

		await collectBundle({
			mode,
			revision,
			label,
			forceCleanBuild: flags["force-clean-build"],
			packageDir,
			analysisDir,
		});
	}
}
