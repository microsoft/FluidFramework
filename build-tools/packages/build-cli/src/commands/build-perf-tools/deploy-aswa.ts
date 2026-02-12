/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import { TEMPLATES_DIR } from "../../library/buildPerf/htmlGenerator.js";
import type { BuildPerfMode } from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/index.js";

/**
 * Deploy the build performance dashboard to Azure Static Web Apps.
 * Prepares a deployment package (data files, HTML template, config) and deploys it using the SWA CLI.
 */
export default class BuildPerfDeployCommand extends BaseCommand<
	typeof BuildPerfDeployCommand
> {
	static readonly description =
		"Deploy the build performance dashboard to Azure Static Web Apps.";

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
		deploymentToken: Flags.string({
			description: "Azure Static Web Apps deployment token.",
			env: "SWA_DEPLOYMENT_TOKEN",
			required: true,
		}),
		dataDir: Flags.directory({
			description: "Directory containing generated data files (public-data.json / internal-data.json).",
			env: "DATA_DIR",
			required: true,
		}),
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Deploy dashboard for public mode.",
			command:
				"<%= config.bin %> <%= command.id %> --mode public --aswaHostname myapp.azurestaticapps.net --dataDir ./data --deploymentToken $SWA_TOKEN",
		},
	];

	public async run(): Promise<void> {
		const { flags } = this;
		const mode = flags.mode as BuildPerfMode;

		// Use a temp deploy directory
		const deployDir = path.join(flags.dataDir, ".deploy");
		mkdirSync(path.join(deployDir, "data"), { recursive: true });

		this.log("==========================================");
		this.log(`Deploying dashboard to ASWA (${mode} mode)`);
		this.log("==========================================");

		// Copy our generated data file
		let otherFile: string;
		if (mode === "public") {
			copyFileSync(
				path.join(flags.dataDir, "public-data.json"),
				path.join(deployDir, "data/public-data.json"),
			);
			otherFile = "internal-data.json";
		} else {
			copyFileSync(
				path.join(flags.dataDir, "internal-data.json"),
				path.join(deployDir, "data/internal-data.json"),
			);
			otherFile = "public-data.json";
		}

		// Try to fetch the other mode's data from the live site
		this.log(`Fetching existing ${otherFile} from dashboard...`);
		const fetchUrl = `https://${flags.aswaHostname}/data/${otherFile}`;
		const fetchOutput = path.join(deployDir, "data", otherFile);

		this.log(`Fetching from: ${fetchUrl}`);
		try {
			const response = await fetch(fetchUrl, {
				signal: AbortSignal.timeout(30_000),
			});

			if (response.ok) {
				const text = await response.text();
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
			}
		} catch (err) {
			this.warning(`Failed to fetch ${otherFile}: ${err}`);
		}

		// Copy static web app files from bundled templates
		copyFileSync(
			path.join(TEMPLATES_DIR, "staticwebapp-template.config.json"),
			path.join(deployDir, "staticwebapp.config.json"),
		);
		copyFileSync(
			path.join(TEMPLATES_DIR, "dashboard-template.html"),
			path.join(deployDir, "index.html"),
		);

		this.log("");
		this.log("Deployment package contents:");
		this.logDeployContents(deployDir);

		// Deploy using the SWA CLI
		this.log("");
		this.log("Deploying to Azure Static Web Apps...");
		try {
			execSync(
				`npx --yes @azure/static-web-apps-cli deploy ${deployDir} --deployment-token ${flags.deploymentToken}`,
				{ stdio: "inherit" },
			);
			this.log("");
			this.log(`Dashboard deployed to https://${flags.aswaHostname}`);
		} catch (err) {
			this.error(`SWA deployment failed: ${err}`);
		}
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
