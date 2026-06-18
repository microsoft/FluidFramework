/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { resolve } from "node:path";
import { Flags } from "@oclif/core";

import { compareBundles } from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Compares the two bundles previously collected by `flub generate bundleAnalysisRepo`
 * (base = --base-label, current = --current-label) and writes human-readable `.txt` and
 * structured `.json` comparison reports.
 */
export default class CheckBundleAnalysisReposComparison extends BaseCommand<
	typeof CheckBundleAnalysisReposComparison
> {
	public static readonly description =
		"Compare the two bundles previously collected by 'flub generate bundleAnalysisRepo' " +
		"(base = --base-label, current = --current-label).\n\n" +
		"To learn more see the detailed documentation at https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/bundleAnalysisRepoDetails.md";

	public static readonly examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --base-label some-revision",
		"<%= config.bin %> <%= command.id %> --analysis-dir /some/other/path",
	];

	public static readonly flags = {
		"analysis-dir": Flags.string({
			description: "Parent directory containing analyzer.json files at {label}/analyzer.json.",
			default: "./compareBundlesOutput/analysis",
		}),
		"output-dir": Flags.string({
			description: "Directory where the .txt and .json comparison reports are written.",
			default: "./compareBundlesOutput",
		}),
		"base-label": Flags.string({
			description:
				"Label subdirectory under --analysis-dir holding the base-side bundle stats. " +
				"Must match the --label passed to 'flub generate bundleAnalysisRepo' in revision mode.",
			default: "main",
		}),
		"current-label": Flags.string({
			description:
				"Label subdirectory under --analysis-dir holding the current-side bundle stats. " +
				"Must match the --label passed to 'flub generate bundleAnalysisRepo' in local mode (the " +
				"orchestrator passes a timestamped label like 'current_<epoch>').",
			default: "current",
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;
		compareBundles({
			analysisDirectory: resolve(flags["analysis-dir"]),
			outputDirectory: resolve(flags["output-dir"]),
			baseLabel: flags["base-label"],
			currentLabel: flags["current-label"],
		});
	}
}
