/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { generateTypeTests } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";

export default class GenerateTypeTestsCommand extends BaseCommand<
	typeof GenerateTypeTestsCommand.flags
> {
	static description = `Generates type tests based on the individual package settings.

    Generating test modules takes the type test information from the type test config, most notably any known broken type tests, and generates test files that should be committed.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.`;

	static examples = [
		{
			description: "Generate type tests for the package in the current directory.",
			command: "<%= config.bin %> <%= command.id %>",
		},
	];

	public async run(): Promise<void> {
		// Delegate everything
		await generateTypeTests();
	}
}
