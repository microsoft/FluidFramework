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
	];

	public static readonly flags = {
		"base-label": Flags.string({
			description:
				"Label subdirectory under compareBundlesOutput/analysis holding the base-side bundle stats. " +
				"Matches the label 'flub generate bundleAnalysisRepo' saves in revision mode (the sanitized revision).",
			default: "main",
		}),
		"current-label": Flags.string({
			description:
				"Label subdirectory under compareBundlesOutput/analysis holding the current-side bundle stats. " +
				"Matches the label 'flub generate bundleAnalysisRepo' saves in local mode (a timestamped " +
				"'current_<epoch>').",
			default: "current",
		}),
		"webpack-dir": Flags.string({
			description:
				"Directory whose compareBundlesOutput subdirectory holds the bundle stats to compare. Matches the " +
				"--webpack-dir passed to 'flub generate bundleAnalysisRepo' (defaults to the current " +
				"directory).",
			default: ".",
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<void> {
		const { flags } = this;
		const outputDir = resolve(flags["webpack-dir"], "compareBundlesOutput");
		compareBundles({
			analysisDirectory: resolve(outputDir, "analysis"),
			outputDirectory: outputDir,
			baseLabel: flags["base-label"],
			currentLabel: flags["current-label"],
		});
	}
}
