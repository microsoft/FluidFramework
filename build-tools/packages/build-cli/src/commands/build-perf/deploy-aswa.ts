/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import { generateAswaHtml, TEMPLATES_DIR } from "../../library/buildPerf/htmlGenerator.js";
import type { BuildPerfMode } from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/commands/base.js";

/**
 * Manually deploy the build performance dashboard to Azure Static Web Apps.
 * Expects data files produced by the `collect-data` command. Prepares a deployment
 * package (data files, HTML, config) and deploys using the SWA CLI. The SWA CLI is
 * used instead of standard GitHub-based deployment because this pipeline runs in ADO.
 * The deployed HTML fetches data at runtime from `data/*.json`, showing tabs for both modes.
 */
export default class BuildPerfDeployCommand extends BaseCommand<
	typeof BuildPerfDeployCommand
> {
	static readonly description =
		"Manually deploy the build performance dashboard to Azure Static Web Apps.";

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
			description:
				"Directory containing generated data files (public-data.json / internal-data.json).",
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
		// oclif validates --mode against the options array, so the cast is safe.
		const mode = flags.mode as BuildPerfMode;

		const deployDir = path.join(flags.dataDir, ".deploy");
		// Clean any stale data from a previous run before creating the deploy directory
		rmSync(deployDir, { recursive: true, force: true });
		mkdirSync(path.join(deployDir, "data"), { recursive: true });

		this.logHr();
		this.log(`Deploying dashboard to ASWA (${mode} mode)`);
		this.logHr();

		// Copy our generated data file
		const currentFile = mode === "public" ? "public-data.json" : "internal-data.json";
		const otherFile = mode === "public" ? "internal-data.json" : "public-data.json";

		const sourceFile = path.join(flags.dataDir, currentFile);
		if (!existsSync(sourceFile)) {
			this.error(`Data file not found: ${sourceFile}`);
		}
		copyFileSync(sourceFile, path.join(deployDir, "data", currentFile));

		// Try to fetch the other mode's data from the live site
		this.log(`Fetching existing ${otherFile} from dashboard...`);
		const fetchUrl = `https://${flags.aswaHostname}/data/${otherFile}`;
		this.log(`Fetching from: ${fetchUrl}`);
		try {
			const response = await fetch(fetchUrl, {
				signal: AbortSignal.timeout(30_000),
			});

			if (response.ok) {
				const text = await response.text();
				try {
					JSON.parse(text);
					writeFileSync(path.join(deployDir, "data", otherFile), text, "utf8");
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

		// Generate the multi-mode HTML (fetches data at runtime, shows tabs)
		const templatePath = path.join(TEMPLATES_DIR, "dashboard.ejs");
		const html = generateAswaHtml(templatePath);
		writeFileSync(path.join(deployDir, "index.html"), html, "utf8");

		// Write staticwebapp.config.json
		const swaConfig = {
			routes: [{ route: "/*", allowedRoles: ["anonymous"] }],
			globalHeaders: { "Cache-Control": "no-cache" },
		};
		writeFileSync(
			path.join(deployDir, "staticwebapp.config.json"),
			JSON.stringify(swaConfig, undefined, "\t"),
			"utf8",
		);

		this.log("");
		this.log("Deployment package contents:");
		this.logDeployContents(deployDir);

		// Deploy using the SWA CLI
		this.log("");
		this.log("Deploying to Azure Static Web Apps...");
		try {
			execFileSync(
				"npx",
				[
					"--yes",
					// Pinned for stability
					"@azure/static-web-apps-cli@2.0.8",
					"deploy",
					deployDir,
					"--deployment-token",
					flags.deploymentToken,
					"--env",
					"production",
				],
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
				this.logIndent(`${prefix}${entry} (${stat.size} bytes)`);
			}
		}
	}
}
