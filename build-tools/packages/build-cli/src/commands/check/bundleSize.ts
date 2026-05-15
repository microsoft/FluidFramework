/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import { Flags } from "@oclif/core";

import { getArtifactForCommit } from "../../library/azureDevops/getArtifactForCommit.js";
import { getAzureDevopsApi } from "../../library/azureDevops/getAzureDevopsApi.js";
import {
	compareJsonReportsByPackage,
	extractAnalyzerJsonsFromArtifact,
	type PackageComparison,
	readAnalyzerJsonsFromFileSystem,
} from "../../library/bundleSize/index.js";
import { BaseCommand } from "../../library/commands/base.js";
import { pickFreshestRemote } from "../../library/git/pickFreshestRemote.js";

// Must match the "public" project + build-bundle-size-artifacts.yml (definitionId 48).
const adoConstants = {
	orgUrl: "https://dev.azure.com/fluidframework",
	projectName: "public",
	ciBuildDefinitionId: 48,
	artifactName: "bundleAnalyzerJson",
} as const;

// Where `flub generate bundleStats` (via `npm run bundle-analysis:collect`) writes.
const defaultLocalReportPath = "./artifacts/bundleAnalyzerJson";

/**
 * Result serialized to stdout by `--json`. Default invocations print a
 * human-readable summary instead.
 */
type CheckBundleSizeResult =
	| { kind: "no-changes"; baselineCommit: string }
	| { kind: "changes"; baselineCommit: string; comparison: PackageComparison }
	| { kind: "error"; baselineCommit: string | undefined; error: string };

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
		try {
			const { localReportPath, target } = this.flags;

			// Auto-detect targets `main` on the canonical remote; `--target <ref>` overrides.
			const branch = "main";
			const canonicalUrl = /(^|[/:])microsoft\/fluidframework(\.git)?$/i;
			let targetRef: string;
			if (target !== undefined) {
				targetRef = target;
				this.log(`Using explicit target ref ${target}.`);
			} else {
				const remote = pickFreshestRemote(branch, (url) => canonicalUrl.test(url)) ?? "origin";
				targetRef = `${remote}/${branch}`;
				this.log(`Using target ref ${targetRef}. Pass --target <ref> to override.`);
			}

			const baselineCommit = execFileSync("git", ["merge-base", targetRef, "HEAD"])
				.toString()
				.trim();
			this.log(`Baseline commit: ${baselineCommit}`);

			// Anonymous reads work for the public ADO project at this command's scale;
			// automated consumers authenticate at the library layer.
			const adoApi = getAzureDevopsApi(undefined, adoConstants.orgUrl);
			const artifactResult = await getArtifactForCommit({
				adoApi,
				artifactName: adoConstants.artifactName,
				commit: baselineCommit,
				definitionId: adoConstants.ciBuildDefinitionId,
				project: adoConstants.projectName,
			});

			if (artifactResult.kind === "error") {
				this.warning(artifactResult.error);
				return { kind: "error", baselineCommit, error: artifactResult.error };
			}

			const baselineJsons = extractAnalyzerJsonsFromArtifact(artifactResult.contents);
			const prJsons = await readAnalyzerJsonsFromFileSystem(localReportPath);

			if (baselineJsons.size === 0 && prJsons.size === 0) {
				const message =
					"No bundles to compare — baseline artifact and local bundle reports are both empty.";
				this.warning(message);
				return { kind: "error", baselineCommit, error: message };
			}

			const comparison = compareJsonReportsByPackage(baselineJsons, prJsons);

			const fmt = (before: number, after: number): string => {
				const delta = after - before;
				const sign = delta > 0 ? "+" : "";
				return `${before} -> ${after} (${sign}${delta})`;
			};

			const changeLines: string[] = [];
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
				changeLines.push(`  ${sourcePackage}:`, ...bundleLines);
			}

			if (changeLines.length === 0) {
				this.log(`No bundle size changes vs baseline commit ${baselineCommit}.`);
				return { kind: "no-changes", baselineCommit };
			}

			this.log(`Bundle size changes vs baseline commit ${baselineCommit}:`);
			for (const line of changeLines) this.log(line);

			return { kind: "changes", baselineCommit, comparison };
		} catch (e) {
			const error = `Unexpected failure: ${e instanceof Error ? e.message : String(e)}`;
			this.warning(error);
			return { kind: "error", baselineCommit: undefined, error };
		}
	}
}
