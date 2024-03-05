/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import { execSync } from "node:child_process";
import path from "node:path";

import { BaseCommand } from "../../base";

export default class RunBundlestats extends BaseCommand<typeof RunBundlestats> {
	static readonly description =
		`Generate a report from input bundle stats collected through the collect bundleStats command.`;

	static readonly flags = {
		dangerfile: Flags.file({
			description: "Path to dangerfile",
			required: false,
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		// eslint-disable-next-line unicorn/prefer-module
		const dangerfile =
			this.flags.dangerfile ?? path.join(__dirname, "../../lib/dangerfile.js");

		// ADO:3710 This needs to change in order to remove the 'danger' dependency in the root package.json
		execSync(`npx danger ci -d ${dangerfile}`, { stdio: "inherit" });
	}
}
