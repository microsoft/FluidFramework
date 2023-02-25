/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { execSync } from "child_process";
import path from "path";

import { BaseCommand } from "../../base";

export default class RunBundlestats extends BaseCommand<typeof RunBundlestats.flags> {
	static description = `Generate a report from input bundle stats collected through the collect bundleStats command.`;

	static flags = {
		dangerfile: Flags.file({
			description: "Path to dangerfile",
			required: false,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const flags = this.processedFlags;
		// eslint-disable-next-line unicorn/prefer-module
		const dangerfile = flags.dangerfile ?? path.join(__dirname, "../../lib/dangerfile.js");

		execSync(`npx danger ci -d ${dangerfile}`, { stdio: "inherit" });
	}
}
