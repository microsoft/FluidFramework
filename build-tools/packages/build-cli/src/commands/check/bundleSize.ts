/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import { Flags } from "@oclif/core";

import { fluidframeworkAdoOrgUrl } from "../../library/azureDevops/constants.js";
import { getArtifactForCommit } from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	bundleSizeArtifactsBaselinePipeline,
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
	type PackageComparison,
	readAnalyzerJsonsFromFileSystem,
} from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";
import { pickFreshestRemote } from "../../library/git/pickFreshestRemote.js";

// Where `flub generate bundleStats` (via `pnpm bundle-analysis:collect`) writes.
const defaultLocalReportPath = "./artifacts/bundleAnalyzerJson";

/**
 * Result serialized to stdout by `--json`. Default invocations print a
 * human-readable summary instead.
 */
interface CheckBundleSizeResult {
	baselineCommit: string;
	comparison: PackageComparison;
}

/**
 * Render a {@link PackageComparison} as a flat list of human-readable lines.
 * Skips packages whose bundles all have zero deltas.
 *
 * @returns The rendered lines, or an empty array when nothing changed across
 * the whole comparison.
 */
function formatComparison(comparison: PackageComparison): string[] {
	const fmt = (before: number, after: number): string => {
		const delta = after - before;
		const sign = delta > 0 ? "+" : "";
		return `${before} → ${after} (${sign}${delta})`;
	};

	const lines: string[] = [];
	for (const [sourcePackage, bundles] of Object.entries(comparison)) {
		const bundleLines: string[] = [];
		for (const [bundleName, { base, compare }] of Object.entries(bundles)) {
			if (base === undefined && compare !== undefined) {
				bundleLines.push(
					`    ${bundleName}: added (parsed ${compare.parsedSize}, gzip ${compare.gzipSize})`,
				);
			} else if (compare === undefined && base !== undefined) {
				bundleLines.push(
					`    ${bundleName}: removed (was parsed ${base.parsedSize}, gzip ${base.gzipSize})`,
				);
			} else if (base !== undefined && compare !== undefined) {
				const parsedChanged = base.parsedSize !== compare.parsedSize;
				const gzipChanged = base.gzipSize !== compare.gzipSize;
				if (!parsedChanged && !gzipChanged) continue;
				bundleLines.push(
					`    ${bundleName}: parsed ${fmt(base.parsedSize, compare.parsedSize)}, gzip ${fmt(base.gzipSize, compare.gzipSize)}`,
				);
			}
		}
		if (bundleLines.length === 0) continue;
		lines.push(`  ${sourcePackage}:`, ...bundleLines);
	}
	return lines;
}

export default class CheckBundleSize extends BaseCommand<typeof CheckBundleSize> {
	static readonly description =
		`Compare the locally-collected bundle reports against the CI build of the merge-base commit (between HEAD and a target ref) and print the diff. By default, the target is auto-detected as \`<canonical-remote>/main\` where \`<canonical-remote>\` is whichever remote points at \`microsoft/FluidFramework\`; pass \`--target\` to override. Prints a human-readable summary by default; pass --json for the structured result.`;

	static readonly enableJsonFlag = true;

	static readonly flags = {
		localReportPath: Flags.directory({
			description: `Path to the locally-collected bundle reports (as produced by \`flub generate bundleStats\`).`,
			default: defaultLocalReportPath,
			required: false,
		}),
		target: Flags.string({
			description:
				"Target ref — the ref you'd be PRing against. Typically `<remote>/<branch>` (e.g. 'upstream/main', 'origin/release/2.x'), but accepts any ref `git merge-base` understands. Skips auto-detection of the canonical remote. The bundles aren't compared against this ref directly — the baseline commit is `git merge-base <target> HEAD`.",
			required: false,
		}),
		...BaseCommand.flags,
	} as const;

	public async run(): Promise<CheckBundleSizeResult> {
		const { localReportPath, target } = this.flags;

		// Auto-detect targets `main` on the canonical remote; `--target <ref>` overrides.
		const branch = "main";
		const canonicalUrl = /(^|[/:])microsoft\/fluidframework(\.git)?$/i;
		let targetRef: string;
		if (target !== undefined) {
			targetRef = target;
			this.log(`Using explicit target ref ${target}.`);
		} else {
			const remote = pickFreshestRemote(branch, (url) => canonicalUrl.test(url));
			if (remote === undefined) {
				this.error(
					"Could not auto-detect a canonical remote. Add a remote pointing at microsoft/FluidFramework, or pass --target <ref> to override.",
				);
			}
			targetRef = `${remote}/${branch}`;
			this.log(`Using target ref ${targetRef}. Pass --target <ref> to override.`);
		}

		let baselineCommit: string;
		try {
			baselineCommit = execFileSync("git", ["merge-base", targetRef, "HEAD"], {
				stdio: ["ignore", "pipe", "pipe"],
			})
				.toString()
				.trim();
		} catch (e) {
			const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim();
			this.error(
				`Could not determine merge-base for ref "${targetRef}". Ensure it is fetched locally, or pass --target <ref> to override.${
					stderr ? `\n${stderr}` : ""
				}`,
			);
		}
		this.log(`Baseline commit: ${baselineCommit}`);

		// Public ADO project — anonymous reads are fine at this command's scale.
		const adoApi = getAzureDevopsApi(undefined, fluidframeworkAdoOrgUrl);
		const artifactContents = await getArtifactForCommit({
			adoApi,
			artifactName: bundleSizeArtifactsBaselinePipeline.bundleAnalyzerJsonArtifactName,
			match: { kind: "commit", sha: baselineCommit },
			definitionId: bundleSizeArtifactsBaselinePipeline.definitionId,
			project: bundleSizeArtifactsBaselinePipeline.project,
		});

		const baselineJsons = extractAnalyzerJsonsFromArtifact(artifactContents);
		if (baselineJsons.size === 0) {
			this.error(
				`Baseline artifact contains no analyzer.json files for commit ${baselineCommit}.`,
			);
		}

		const localResult = await readAnalyzerJsonsFromFileSystem(localReportPath);
		// Append the `pnpm bundle-analysis:collect` hint only on the default
		// path — overrides are populated from some source we don't know about.
		const hint =
			localReportPath === defaultLocalReportPath
				? " Run `pnpm bundle-analysis:collect` to populate it."
				: "";
		if (localResult.kind === "error") {
			this.error(
				`Local bundle report path "${localReportPath}" is missing or not a directory.${hint}`,
			);
		}
		const compareJsons = localResult.data;
		if (compareJsons.size === 0) {
			this.error(
				`Local bundle report directory "${localReportPath}" contains no analyzer.json files at the expected \`<package>/analyzer.json\` layout.${hint}`,
			);
		}

		const comparison = compareJsonReportsByPackage(baselineJsons, compareJsons);
		const changeLines = formatComparison(comparison);

		if (changeLines.length === 0) {
			this.log(`No bundle size changes vs baseline commit ${baselineCommit}.`);
		} else {
			this.log(`Bundle size changes vs baseline commit ${baselineCommit}:`);
			for (const line of changeLines) this.log(line);
		}

		return { baselineCommit, comparison };
	}
}
