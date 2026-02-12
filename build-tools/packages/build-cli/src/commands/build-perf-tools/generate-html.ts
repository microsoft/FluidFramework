/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Flags } from "@oclif/core";

import {
	TEMPLATES_DIR,
	generateStandaloneHtml,
} from "../../library/buildPerf/htmlGenerator.js";
import type { BuildPerfMode } from "../../library/buildPerf/types.js";
import { BaseCommand } from "../../library/index.js";

/**
 * Generate a standalone HTML dashboard artifact from processed metrics.
 * The generated file contains data for a single mode (public or internal)
 * inlined directly into the HTML, so it can be viewed offline.
 */
export default class BuildPerfHtmlCommand extends BaseCommand<typeof BuildPerfHtmlCommand> {
	static readonly description =
		"Generate a standalone HTML dashboard artifact from processed metrics.";

	static readonly flags = {
		mode: Flags.string({
			description: 'Pipeline mode: "public" or "internal".',
			env: "MODE",
			required: true,
			options: ["public", "internal"],
		}),
		inputDir: Flags.directory({
			description: "Directory containing the data JSON files (public-data.json / internal-data.json).",
			env: "INPUT_DIR",
			required: true,
		}),
		outputDir: Flags.directory({
			description: "Directory where the dashboard.html will be written.",
			env: "OUTPUT_DIR",
			required: true,
		}),
		...BaseCommand.flags,
	};

	static readonly examples = [
		{
			description: "Generate standalone HTML dashboard for public mode.",
			command:
				"<%= config.bin %> <%= command.id %> --mode public --inputDir ./data --outputDir ./output",
		},
	];

	public async run(): Promise<void> {
		const { flags } = this;
		const mode = flags.mode as BuildPerfMode;

		const standaloneFile = path.join(flags.outputDir, "dashboard.html");

		this.log("==========================================");
		this.log(`Generating standalone HTML dashboard (${mode} mode)`);
		this.log("==========================================");

		// Determine the data file for this mode
		const dataFile =
			mode === "public"
				? path.join(flags.inputDir, "public-data.json")
				: path.join(flags.inputDir, "internal-data.json");

		if (!existsSync(dataFile)) {
			this.error(`Data file not found: ${dataFile}`);
		}

		const fileSize = statSync(dataFile).size;
		this.log(`Found data file: ${dataFile} (${fileSize} bytes)`);

		// Read data and generate standalone HTML
		const templatePath = path.join(TEMPLATES_DIR, "dashboard-template.html");
		const dataJson = readFileSync(dataFile, "utf8").trim();

		const html = generateStandaloneHtml(templatePath, dataJson, mode);
		writeFileSync(standaloneFile, html, "utf8");

		this.log(`Generated standalone dashboard: ${standaloneFile}`);
		this.log(`File size: ${statSync(standaloneFile).size} bytes`);
	}
}
