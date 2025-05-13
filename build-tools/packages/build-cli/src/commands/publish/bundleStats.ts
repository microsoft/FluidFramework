/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Flags } from "@oclif/core";

import { BaseCommand } from "../../library/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class Bundlestats extends BaseCommand<typeof Bundlestats> {
	static readonly description =
		`Generate a report from input bundle stats collected through the collect bundleStats command.`;

	static readonly aliases = ["run:bundleStats"];
	static readonly deprecateAliases = true;

	static readonly flags = {
		dangerfile: Flags.file({
			description: "Path to dangerfile",
			required: false,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const dangerfile =
			this.flags.dangerfile ?? path.join(__dirname, "../../library/dangerfile.cjs");

		// ADO:3710 This needs to change in order to remove the 'danger' dependency in the root package.json
		execSync(`npx danger ci -d ${dangerfile}`, { stdio: "inherit" });
	}
}
