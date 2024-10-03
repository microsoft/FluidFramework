/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import type { ApiModel } from "@microsoft/api-extractor-model";
import { Args, Command, Flags } from "@oclif/core";
import Chalk from "chalk";

import { lintApiModel, type LinterErrors, type LinterReferenceError } from "../LintApiModel.js";
import { loadModel } from "../LoadModel.js";
import { silentLogger, type Logger } from "../Logging.js";
import { DocumentWriter } from "../renderers/index.js";

const commandDescription = `Runs a validation pass over the specified API model, reporting any errors found.
This includes broken \`{@link}\` and \`{@inheritDoc}\` tag references, which can not be evaluated on a package-by-package basis by API-Extractor.`;

/**
 * `oclif` command for linting an API model.
 *
 * @see {@link lintApiModel}
 */
// eslint-disable-next-line import/no-default-export
export default class LintApiModelCommand extends Command {
	public static override args = {
		apiModelDirectory: Args.string({
			description:
				"Path to the directory containing the series of `.api.json` files that comprise the API Model.",
			required: true,
		}),
	};

	public static override description = commandDescription;

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
		const { args, flags } = await this.parse(LintApiModelCommand);
		const { apiModelDirectory } = args;
		const { verbose, workingDirectory, quiet } = flags;

		// eslint-disable-next-line unicorn/consistent-function-scoping
		function getMessage(messageOrError: string | Error): string | undefined {
			if (messageOrError instanceof Error) {
				return messageOrError.message;
			}
			return messageOrError;
		}

		// TODO: what is the right way to plumb logs through oclif?
		let logger: Logger = {
			...silentLogger,
		};
		if (!quiet) {
			logger = {
				...logger,
				info: (message, ...parameters) =>
					this.log(Chalk.blue(getMessage(message)), ...parameters),
				error: (message) => this.error(message),
				warning: (message) => this.warn(message),
				success: (message, ...parameters) =>
					this.log(Chalk.green(getMessage(message)), ...parameters),
			};
		}
		if (verbose) {
			logger = {
				...logger,
				verbose: (message, ...parameters) =>
					this.log(Chalk.gray(getMessage(message)), ...parameters),
			};
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
			this.error(`Error loading API model: ${(error as Error).message}`, { exit: 1 });
		}

		// Lint the API model
		let errors: LinterErrors | undefined;
		try {
			errors = await lintApiModel({ apiModel, logger });
		} catch (error: unknown) {
			this.error(`Error linting API model: ${(error as Error).message}`, { exit: 1 });
		}

		// If any linter errors were found, report a user-friendly log message
		if (errors === undefined) {
			this.log("No errors found in the API model!");
		} else {
			const errorReport = createErrorReport(errors);
			this.error(errorReport, { exit: 1 });
		}

		// No errors!!
		this.log(Chalk.green("No errors found in the API model!"));
	}
}

function createErrorReport(errors: LinterErrors): string {
	const documentWriter = DocumentWriter.create();

	// TODO: handle other error types when they are added.
	const errorCount = errors.referenceErrors.size;
	documentWriter.writeLine(`Found ${errorCount} docs errors:`);

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
	const sortedErrors = sortReferenceErrors(referenceErrors);

	// Write errors by package
	documentWriter.ensureNewLine();
	for (const [packageName, packageErrors] of sortedErrors) {
		documentWriter.writeLine(`${packageName}:`);
		documentWriter.increaseIndent();
		for (const [sourceItem, sourceItemErrors] of packageErrors) {
			const sourceItemLabel = sourceItem === "" ? "(@packageDocumentation)" : sourceItem;
			documentWriter.writeLine(`${sourceItemLabel}:`);
			documentWriter.increaseIndent("  - ");
			for (const error of sourceItemErrors) {
				const tagString = createReferenceTagString(
					error.tagName,
					error.referenceTarget,
					error.linkText,
				);
				documentWriter.writeLine(
					`Reference tag "${tagString}" could not be resolved: ${error.innerErrorMessage}.`,
				);
			}
			documentWriter.decreaseIndent();
		}
		documentWriter.decreaseIndent();
	}
}

/**
 * Buckets the input reference errors by package name, then by source item.
 */
function sortReferenceErrors(
	referenceErrors: ReadonlySet<LinterReferenceError>,
): ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<LinterReferenceError>>> {
	const result = new Map<string, Map<string, Set<LinterReferenceError>>>();

	// Bucket by package name
	for (const error of referenceErrors) {
		const packageName = error.packageName;

		let packageErrors = result.get(packageName);
		if (packageErrors === undefined) {
			packageErrors = new Map<string, Set<LinterReferenceError>>();
			result.set(packageName, packageErrors);
		}

		let sourceItemErrors = packageErrors.get(error.sourceItem ?? "");
		if (sourceItemErrors === undefined) {
			sourceItemErrors = new Set<LinterReferenceError>();
			packageErrors.set(error.sourceItem ?? "", sourceItemErrors);
		}

		sourceItemErrors.add(error);
	}

	return result;
}

function createReferenceTagString(tag: string, target: string, text: string | undefined): string {
	return `{${tag} ${target}${text === undefined ? "" : ` | ...`}}`;
}
