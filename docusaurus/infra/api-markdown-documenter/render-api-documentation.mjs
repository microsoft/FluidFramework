/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiItemKind,
	ApiItemUtilities,
	DocumentationNodeType,
	getApiItemTransformationConfigurationWithDefaults,
	loadModel,
	MarkdownRenderer,
	ReleaseTag,
	transformApiModel,
} from "@fluid-tools/api-markdown-documenter";
import { PackageName } from "@rushstack/node-core-library";
import chalk from "chalk";
import fs from "fs-extra";
import path from "path";

import { admonitionNodeType } from "./admonition-node.mjs";
import { layoutContent } from "./api-documentation-layout.mjs";
import { renderAdmonitionNode, renderBlockQuoteNode, renderTableNode } from "./custom-renderers.mjs";

/**
 * Generates a documentation suite for the API model saved under `inputDir`, saving the output to `outputDir`.
 * @param {string} inputDir - The directory path containing the API model to be processed.
 * @param {string} outputDir - The directory path under which the generated documentation suite will be saved.
 * @param {string} uriRootDir - The base for all links between API members.
 */
export async function renderApiDocumentation(inputDir, outputDir, uriRootDir) {
	/**
	 * Logs a progress message, prefaced with the API version number to help differentiate parallel logging output.
	 */
	function logProgress(message) {
		console.log(`${message}`);
	}

	/**
	 * Logs the error with the specified message, prefaced with the API version number to help differentiate parallel
	 * logging output, and re-throws the error.
	 */
	function logErrorAndRethrow(message, error) {
		console.error(chalk.red(`${message}:`));
		console.error(error);
		throw error;
	}

	// Delete existing documentation output
	logProgress("Removing existing generated API docs...");
	await fs.ensureDir(outputDir);
	await fs.emptyDir(outputDir);

	// Process API reports
	logProgress("Loading API model...");

	const apiModel = await loadModel({ modelDirectoryPath: inputDir });

	// Custom renderers that utilize Docusaurus syntax for certain kinds of documentation elements.
	const customRenderers = {
		[DocumentationNodeType.BlockQuote]: renderBlockQuoteNode,
		[DocumentationNodeType.Table]: renderTableNode,
		[admonitionNodeType]: renderAdmonitionNode,
	};

	const config = getApiItemTransformationConfigurationWithDefaults({
		apiModel,
		documentBoundaries: [
			ApiItemKind.Class,
			ApiItemKind.Enum,
			ApiItemKind.Interface,
			ApiItemKind.Namespace,
			ApiItemKind.TypeAlias,
		],
		newlineKind: "lf",
		uriRoot: uriRootDir,
		includeBreadcrumb: true,
		includeTopLevelDocumentHeading: false, // This will be added automatically by Docusaurus?
		createDefaultLayout: layoutContent,
		getAlertsForItem: (apiItem) => {
			const alerts = [];
			if (ApiItemUtilities.ancestryHasModifierTag(apiItem, "@system")) {
				alerts.push("System");
			} else {
				if (ApiItemUtilities.isDeprecated(apiItem)) {
					alerts.push("Deprecated");
				}
				if (ApiItemUtilities.hasModifierTag(apiItem, "@legacy")) {
					alerts.push("Legacy");
				}

				const releaseTag = ApiItemUtilities.getReleaseTag(apiItem);
				if (releaseTag === ReleaseTag.Alpha) {
					alerts.push("Alpha");
				} else if (releaseTag === ReleaseTag.Beta) {
					alerts.push("Beta");
				}
			}
			return alerts;
		},
		skipPackage: (apiPackage) => {
			const packageName = apiPackage.displayName;
			const packageScope = PackageName.getScope(packageName);

			// Skip `@fluid-private` packages
			// TODO: Also skip `@fluid-internal` packages once we no longer have public, user-facing APIs that reference their contents.
			return ["@fluid-private"].includes(packageScope);
		},
	});

	logProgress("Generating API documentation...");

	let documents;
	try {
		documents = transformApiModel(config);
	} catch (error) {
		logErrorAndRethrow("Encountered error while processing API model", error);
	}

	logProgress("Writing API documents to disk...");

	await Promise.all(
		documents.map(async (document) => {
			// TODO: custom landing pages for API suites?
			let fileContents;
			try {
				// TODO
				const documentFrontMatter = undefined;
				const documentBody = MarkdownRenderer.renderDocument(document, {
					startingHeadingLevel: 2, // TODO
					customRenderers,
				});
				fileContents =
					documentFrontMatter === undefined
						? documentBody
						: `${documentFrontMatter}\n\n${documentBody}`;
			} catch (error) {
				logErrorAndRethrow(
					`Encountered error while rendering Markdown contents for "${document.apiItem.displayName}"`,
					error,
				);
			}

			let filePath = path.join(outputDir, `${document.documentPath}.md`);

			try {
				await fs.ensureFile(filePath);
				await fs.writeFile(filePath, fileContents);
			} catch (error) {
				logErrorAndRethrow(
					`Encountered error while writing file output for "${document.apiItem.displayName}"`,
					error,
				);
			}
		}),
	);
}
