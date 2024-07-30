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

import { alertNodeType } from "./alert-node.js";
import { ancestryHasModifierTag, layoutContent } from "./api-documentation-layout.js";
import { buildNavBar } from "./build-api-nav.js";
import { renderAlertNode, renderBlockQuoteNode, renderTableNode } from "./custom-renderers.js";
import { createHugoFrontMatter } from "./front-matter.js";

/**
 * Generates a documentation suite for the API model saved under `inputDir`, saving the output to `outputDir`.
 * @param {string} inputDir - The directory path containing the API model to be processed.
 * @param {string} outputDir - The directory path under which the generated documentation suite will be saved.
 * @param {string} uriRootDir - The base for all links between API members.
 * @param {string} apiVersionNum - The API model version string used to differentiate different major versions of the
 * framework for which API documentation is presented on the website.
 */
export async function renderApiDocumentation(inputDir, outputDir, uriRootDir, apiVersionNum) {
	/**
	 * Logs a progress message, prefaced with the API version number to help differentiate parallel logging output.
	 */
	function logProgress(message) {
		console.log(`(${apiVersionNum}) ${message}`);
	}

	/**
	 * Logs the error with the specified message, prefaced with the API version number to help differentiate parallel
	 * logging output, and re-throws the error.
	 */
	function logErrorAndRethrow(message, error) {
		console.error(chalk.red(`(${apiVersionNum}) ${message}:`));
		console.error(error);
		throw error;
	}

	// Delete existing documentation output
	logProgress("Removing existing generated API docs...");
	await fs.ensureDir(outputDir);
	await fs.emptyDir(outputDir);

	// Process API reports
	logProgress("Loading API model...");

	const apiModel = await loadModel(inputDir);

	// Custom renderers that utilize Hugo syntax for certain kinds of documentation elements.
	const customRenderers = {
		[DocumentationNodeType.BlockQuote]: renderBlockQuoteNode,
		[DocumentationNodeType.Table]: renderTableNode,
		[alertNodeType]: renderAlertNode,
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
		includeBreadcrumb: true, // Hugo will now be used to generate the breadcrumb
		includeTopLevelDocumentHeading: false, // This will be added automatically by Hugo
		createDefaultLayout: layoutContent,
		getAlertsForItem: (apiItem) => {
			const alerts = [];
			if (ancestryHasModifierTag(apiItem, "@system")) {
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

	logProgress("Generating nav bar contents...");

	try {
		await buildNavBar(documents, apiVersionNum);
	} catch (error) {
		logErrorAndRethrow("Encountered an error while saving nav bar yaml files", error);
	}

	logProgress("Writing API documents to disk...");

	await Promise.all(
		documents.map(async (document) => {
			// We inject custom landing pages for each model (the root of a versioned documentation suite) using Hugo,
			// so we will skip generating a file for the model here.
			// TODO: add native support to api-markdown-documenter to allow skipping document generation for different
			// kinds of items, and utilize that instead.
			if (document.apiItem?.kind === ApiItemKind.Model) {
				return;
			}

			let fileContents;
			try {
				const documentFrontMatter =
					document.apiItem === undefined
						? undefined
						: createHugoFrontMatter(
								document.apiItem,
								config,
								customRenderers,
								apiVersionNum,
							);
				const documentBody = MarkdownRenderer.renderDocument(document, {
					startingHeadingLevel: 2, // Hugo will inject its document titles as 1st level headings, so start content heading levels at 2.
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
