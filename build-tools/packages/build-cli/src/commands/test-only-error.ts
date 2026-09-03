/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseCommand } from "../library/commands/base.js";

/**
 * A command that always fails so BaseCommand error handling can be tested through oclif.
 */
export default class TestOnlyErrorCommand extends BaseCommand<typeof TestOnlyErrorCommand> {
	static readonly hidden = true;

	public async run(): Promise<void> {
		this.error("Intentional test error.", { exit: 1 });
	}
}
