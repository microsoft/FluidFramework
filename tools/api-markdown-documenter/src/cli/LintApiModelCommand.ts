/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import type { ApiModel } from "@microsoft/api-extractor-model";
import { Args, Command, Flags } from "@oclif/core";

import { lintApiModel, type LinterErrors, type LinterReferenceError } from "../LintApiModel.js";
import { loadModel } from "../LoadModel.js";
import {
	defaultConsoleLogger,
	silentLogger,
	verboseConsoleLogger,
	type Logger,
} from "../Logging.js";
import { DocumentWriter } from "../renderers/index.js";

/**
 * `oclif` command for linting an API model.
 *
 * @see {@link lintApiModel}
 */
// eslint-disable-next-line import/no-default-export
export default class LintApiModel extends Command {
	public static override args = {
		apiModelDirectory: Args.string({
			description:
				"Path to the directory containing the series of `.api.json` files that comprise the API Model.",
			required: true,
		}),
	};

	public static override description = "describe the command here";

	public static override examples = ["<%= config.bin %> <%= command.id %>"];

	public static override flags = {
		quiet: Flags.boolean({
			char: "q",
			description: "Whether or not to silence logging.",
			required: false,
			default: false,
			exclusive: ["verbose"],
		}),
		verbose: Flags.boolean({
			char: "v",
			description: "Whether or not to perform verbose logging.",
			required: false,
			default: false,
			exclusive: ["quiet"],
		}),
		workingDirectory: Flags.string({
			char: "w",
			description: "The working directory to run the command in.",
			required: false,
			default: process.cwd(),
		}),
	};

	public async run(): Promise<void> {
		const { args, flags } = await this.parse(LintApiModel);
		const { apiModelDirectory } = args;
		const { verbose, workingDirectory, quiet } = flags;

		// TODO: what is the right way to plumb logs through oclif?
		let logger: Logger = defaultConsoleLogger;
		if (quiet) {
			logger = silentLogger;
		} else if (verbose) {
			logger = verboseConsoleLogger;
		}

		const resolvedApiModelDirectoryPath = Path.resolve(workingDirectory, apiModelDirectory);

		// Load the API model
		let apiModel: ApiModel;
		try {
			apiModel = await loadModel({
				modelDirectoryPath: resolvedApiModelDirectoryPath,
				logger,
			});
		} catch (error: unknown) {
			this.error(`Error loading API model: ${(error as Error).message}`);
		}

		// Lint the API model
		let errors: LinterErrors | undefined;
		try {
			errors = await lintApiModel({ apiModel, logger });
		} catch (error: unknown) {
			this.error(`Error linting API model: ${(error as Error).message}`);
		}

		// If any linter errors were found, report a user-friendly log message
		if (errors === undefined) {
			this.log("No errors found in the API model!");
		} else {
			const errorReport = createErrorReport(errors);
			this.error(errorReport);
		}
	}
}

function createErrorReport(errors: LinterErrors): string {
	const documentWriter = DocumentWriter.create();

	// TODO: handle other error types when they are added.
	const errorCount = errors.referenceErrors.size;
	documentWriter.writeLine(`Found ${errorCount} errors in the API model:`);
	documentWriter.increaseIndent();

	documentWriter.writeLine("Reference errors:");
	documentWriter.increaseIndent();
	writeReferenceErrors(errors.referenceErrors, documentWriter);
	documentWriter.decreaseIndent();
	documentWriter.ensureNewLine();

	// TODO: log other error types when they are added.

	documentWriter.decreaseIndent();
	documentWriter.ensureNewLine();

	return documentWriter.getText();
}

function writeReferenceErrors(
	referenceErrors: ReadonlySet<LinterReferenceError>,
	documentWriter: DocumentWriter,
): void {
	// Bucket by package name
	const referenceErrorsByPackage = new Map<string, LinterReferenceError[]>();
	for (const error of referenceErrors) {
		const packageName = error.packageName;
		const errors = referenceErrorsByPackage.get(packageName) ?? [];
		errors.push(error);
		referenceErrorsByPackage.set(packageName, errors);
	}

	// Write errors by package
	documentWriter.ensureNewLine();
	documentWriter.writeLine("The following reference tags could not be resolved:");
	documentWriter.increaseIndent();
	for (const [packageName, errors] of referenceErrorsByPackage) {
		documentWriter.writeLine(`${packageName}:`);
		documentWriter.increaseIndent("- ");
		for (const error of errors) {
			const referenceTag = createReferenceTagString(
				error.tagName,
				error.referenceTarget,
				error.linkText,
			);
			documentWriter.writeLine(
				`${referenceTag} on "${error.sourceItem}" could not be resolved.`,
			);
		}
		documentWriter.decreaseIndent();
	}
	documentWriter.decreaseIndent();
}

function createReferenceTagString(tag: string, target: string, text: string | undefined): string {
	return `{${tag} ${target}${text === undefined ? "" : ` | ${text}`}}`;
}
