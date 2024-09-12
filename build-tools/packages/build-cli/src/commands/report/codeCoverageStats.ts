/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Flags } from "@oclif/core";
import execa from "execa";

import { BaseCommand } from "../../library/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class RunCodeCoverageStats extends BaseCommand<typeof RunCodeCoverageStats> {
	static readonly description = "Run comparison of code coverage stats";

	static readonly flags = {
		dangerfile: Flags.file({
			description: "Path to dangerfile",
			required: false,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const scriptPath = path.join(__dirname, "../../library/codeCoverageDangerFile.cjs");

		await execa
			.command(`npx danger ci -d ${scriptPath}`, { stdio: "inherit" })
			.catch((error) => {
				console.error(error);
				throw error;
			});
	}
}
