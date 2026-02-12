/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import { TEMPLATES_DIR } from "../../library/buildPerf/htmlGenerator.js";
import type { BuildPerfMode } from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/index.js";

/**
 * Prepare deployment package for Azure Static Web App dashboard.
 * Copies generated data and static files, and fetches the other mode's data from the live site.
 */
export default class BuildPerfDeployCommand extends BaseCommand<
	typeof BuildPerfDeployCommand
> {
	static readonly description =
		"Prepare deployment package for Azure Static Web App dashboard.";

	static readonly flags = {
		mode: Flags.string({
			description: 'Pipeline mode: "public" or "internal".',
			env: "MODE",
			required: true,
			options: ["public", "internal"],
		}),
		aswaHostname: Flags.string({
			description: "Hostname of the Azure Static Web App.",
			env: "ASWA_HOSTNAME",
			required: true,
		}),
		outputDir: Flags.directory({
			description: "Directory containing generated data files.",
			env: "OUTPUT_DIR",
			required: true,
		}),
		deployDir: Flags.directory({
			description: "Directory to create deployment package in.",
			env: "DEPLOY_DIR",
			required: true,
		}),
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Prepare deployment package for public mode.",
			command:
				"<%= config.bin %> <%= command.id %> --mode public --aswaHostname myapp.azurestaticapps.net --outputDir ./output --deployDir ./deploy",
		},
	];

	public async run(): Promise<void> {
		const { flags } = this;
		const mode = flags.mode as BuildPerfMode;

		this.log("==========================================");
		this.log(`Preparing deployment package (${mode} mode)`);
		this.log("==========================================");

		// Create deployment directory
		mkdirSync(path.join(flags.deployDir, "data"), { recursive: true });

		// Copy our generated data file
		let otherFile: string;
		if (mode === "public") {
			copyFileSync(
				path.join(flags.outputDir, "public-data.json"),
				path.join(flags.deployDir, "data/public-data.json"),
			);
			otherFile = "internal-data.json";
		} else {
			copyFileSync(
				path.join(flags.outputDir, "internal-data.json"),
				path.join(flags.deployDir, "data/internal-data.json"),
			);
			otherFile = "public-data.json";
		}

		// Try to fetch the other mode's data from the live site
		this.log(`Fetching existing ${otherFile} from dashboard...`);
		const fetchUrl = `https://${flags.aswaHostname}/data/${otherFile}`;
		const fetchOutput = path.join(flags.deployDir, "data", otherFile);

		this.log(`Fetching from: ${fetchUrl}`);
		try {
			const response = await fetch(fetchUrl, {
				signal: AbortSignal.timeout(30_000),
			});

			if (response.ok) {
				const text = await response.text();
				// Validate the response is valid JSON (ASWA may return HTML error pages with 200)
				try {
					JSON.parse(text);
					writeFileSync(fetchOutput, text, "utf8");
					this.log(
						`Successfully fetched ${otherFile} (HTTP ${response.status}, ${text.length} bytes)`,
					);
				} catch {
					this.warning(
						`Fetched ${otherFile} is not valid JSON (possibly an HTML error page). Discarding.`,
					);
				}
			} else {
				this.log(`HTTP ${response.status} - fetch failed`);
				this.log(
					`Note: Could not fetch ${otherFile} (first deployment or other mode hasn't run yet)`,
				);
				this.log(
					"      The dashboard will show 'No data available' for that tab until the other pipeline runs.",
				);
			}
		} catch (err) {
			this.warning(`Failed to fetch ${otherFile}: ${err}`);
			this.log(
				"Note: Could not fetch other mode's data. Dashboard will show 'No data available' for that tab.",
			);
		}

		// Copy static web app files from bundled templates
		copyFileSync(
			path.join(TEMPLATES_DIR, "staticwebapp-template.config.json"),
			path.join(flags.deployDir, "staticwebapp.config.json"),
		);
		copyFileSync(
			path.join(TEMPLATES_DIR, "dashboard-template.html"),
			path.join(flags.deployDir, "index.html"),
		);

		this.log("Deployment package contents:");
		this.logDeployContents(flags.deployDir);
	}

	private logDeployContents(dir: string, prefix = ""): void {
		for (const entry of readdirSync(dir)) {
			const fullPath = path.join(dir, entry);
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				this.logDeployContents(fullPath, `${prefix}${entry}/`);
			} else {
				this.log(`  ${prefix}${entry}`);
			}
		}
	}
}
