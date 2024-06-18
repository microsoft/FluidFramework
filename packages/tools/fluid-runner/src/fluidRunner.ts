/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import yargs from "yargs";
// eslint-disable-next-line import/no-internal-modules
import { hideBin } from "yargs/helpers";

import { IFluidFileConverter } from "./codeLoaderBundle.js";
import { exportFile } from "./exportFile.js";
// eslint-disable-next-line import/no-internal-modules
import { validateAndParseTelemetryOptions } from "./logger/loggerUtils.js";
import { parseBundleAndExportFile } from "./parseBundleAndExportFile.js";
import { validateCommandLineArgs } from "./utils.js";

/**
 * @param fluidFileConverter - needs to be provided if "codeLoaderBundle" is not and vice versa
 * @internal
 */
export async function fluidRunner(fluidFileConverter?: IFluidFileConverter): Promise<void> {
	await yargs(hideBin(process.argv))
		.command(
			"exportFile",
			"Generate an output for a local ODSP snapshot",
			(argv) =>
				argv
					.option("codeLoader", {
						describe:
							'Path to code loader bundle. Required if this application is being called without modification.\nSee "README.md" for more details.',
						type: "string",
						demandOption: false,
					})
					.option("inputFile", {
						describe: "Path to local ODSP snapshot",
						type: "string",
						demandOption: true,
					})
					.option("outputFile", {
						describe:
							"Path of output file (cannot already exist).\nExecution result will be written here",
						type: "string",
						demandOption: true,
					})
					.option("telemetryFile", {
						describe:
							"Path of telemetry file for config and session data (cannot already exist)",
						type: "string",
						demandOption: true,
					})
					.option("options", {
						describe: "Additional options passed to container on execution",
						type: "string",
						demandOption: false,
					})
					.option("telemetryFormat", {
						describe: 'Output format for telemetry. Current options are: ["JSON", "CSV"]',
						type: "string",
						demandOption: false,
						default: "JSON",
					})
					.option("telemetryProp", {
						describe:
							'Property to add to every telemetry entry. Formatted like "--telemetryProp prop1 value1 --telemetryProp prop2 \\"value 2\\"".',
						type: "array",
						demandOption: false,
					})
					.option("eventsPerFlush", {
						describe:
							"Number of telemetry events per flush to telemetryFile (only applicable for JSON format)",
						type: "number",
						demandOption: false,
					})
					.option("timeout", {
						describe: "Allowed timeout in ms before process is automatically cancelled",
						type: "number",
						demandOption: false,
					})
					.option("disableNetworkFetch", {
						describe: "Should network fetch calls be explicitly disabled?",
						type: "boolean",
						demandOption: false,
						default: false,
					}),

			async (argv) => {
				const argsError = validateCommandLineArgs(argv.codeLoader, fluidFileConverter);
				if (argsError) {
					console.error(argsError);
					process.exit(1);
				}
				const telemetryOptionsResult = validateAndParseTelemetryOptions(
					argv.telemetryFormat,
					argv.telemetryProp,
					argv.eventsPerFlush,
				);
				if (!telemetryOptionsResult.success) {
					console.error(telemetryOptionsResult.error);
					process.exit(1);
				}

				const result = await (argv.codeLoader
					? parseBundleAndExportFile(
							argv.codeLoader,
							argv.inputFile,
							argv.outputFile,
							argv.telemetryFile,
							argv.options,
							telemetryOptionsResult.telemetryOptions,
							argv.timeout,
							argv.disableNetworkFetch,
						)
					: exportFile(
							fluidFileConverter!,
							argv.inputFile,
							argv.outputFile,
							argv.telemetryFile,
							argv.options,
							telemetryOptionsResult.telemetryOptions,
							argv.timeout,
							argv.disableNetworkFetch,
						));

				if (!result.success) {
					console.error(`${result.eventName}: ${result.errorMessage}`);
					process.exit(1);
				}
				process.exit(0);
			},
		)
		.help()
		.demandCommand(1)
		.parse();
}
