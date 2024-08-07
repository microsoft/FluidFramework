/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiDocumentedItem,
	type ApiItem,
	ApiItemContainerMixin,
	type ApiModel,
} from "@microsoft/api-extractor-model";
import {
	DocBlock,
	type DocInheritDocTag,
	DocInlineTag,
	type DocLinkTag,
	type DocNode,
	DocNodeContainer,
	DocNodeKind,
} from "@microsoft/tsdoc";

import { defaultLoadModelOptions, loadModel, type LoadModelOptions } from "./LoadModel.js";
import { noopLogger, type Logger } from "./Logging.js";
import { DocumentWriter } from "./renderers/index.js";
import { getScopedMemberNameForDiagnostics, resolveSymbolicReference } from "./utilities/index.js";
import assert from "node:assert";

/**
 * Linter check options.
 *
 * @public
 */
export interface LinterOptions {
	/**
	 * Whether or not to evaluate `{@link}` and `{@inheritDoc}` links as a part of the linting process.
	 * @defaultValue `true`
	 */
	checkLinks?: boolean;
}

/**
 * {@link lintApiModel} options.
 */
export interface LintApiModelOptions extends LoadModelOptions, LinterOptions {}

/**
 * {@link LintApiModelOptions} defaults.
 */
const defaultLintApiModelOptions: Required<Omit<LintApiModelOptions, "modelDirectoryPath">> = {
	...defaultLoadModelOptions,
	checkLinks: true,
};

/**
 * Validates the given API model.
 *
 * @throws If the specified {@link LoadModelOptions.modelDirectoryPath} doesn't exist, or if no `.api.json` files are found directly under it.
 */
export async function lintApiModel(options: LintApiModelOptions): Promise<void> {
	const optionsWithDefaults: Required<LintApiModelOptions> = {
		...defaultLintApiModelOptions,
		...options,
	};
	const { modelDirectoryPath, logger } = optionsWithDefaults;

	logger.verbose("Loading API model...");

	// Load the model
	// Use a no-op logger to prevent logging during the load process
	const apiModel = await loadModel({ modelDirectoryPath, logger: noopLogger });

	logger.verbose("API model loaded.");

	logger.info("Linting API model...");

	// Run "lint" checks on the model. Collect errors and throw an aggregate error if any are found.
	let linkErrors: string[] = [];
	if (optionsWithDefaults.checkLinks) {
		linkErrors = checkLinks(apiModel, apiModel, logger);
	}

	const anyErrors: boolean = linkErrors.length > 0;
	if (anyErrors) {
		const writer = DocumentWriter.create();
		writer.writeLine("API model linting failed with the following errors:");
		writer.increaseIndent();
		if (linkErrors.length > 0) {
			writer.writeLine("Link errors:");
			writer.increaseIndent("  - ");
			for (const linkError of linkErrors) {
				writer.writeLine(linkError.trim());
			}
		}

		throw new Error(writer.getText().trim());
	} else {
		logger.success("API model linting passed.");
	}
}

function checkLinks(apiItem: ApiItem, apiModel: ApiModel, logger: Logger): string[] {
	const errors: string[] = [];

	if (apiItem instanceof ApiDocumentedItem) {
		// Check `@inheritDoc` tag
		// eslint-disable-next-line unicorn/prevent-abbreviations
		const inheritDocError = checkInheritDocTag(apiItem, apiModel);
		if (inheritDocError !== undefined) {
			errors.push(inheritDocError);
		}

		// Check link tags
		errors.push(...checkLinkTags(apiItem, apiModel, logger));
	}

	// Recurse members
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		for (const member of apiItem.members) {
			errors.push(...checkLinks(member, apiModel, logger));
		}
	}

	return errors;
}

function checkLinkTags(
	apiItem: ApiDocumentedItem,
	apiModel: ApiModel,
	logger: Logger,
): readonly string[] {
	const tsdocComment = apiItem.tsdocComment;
	if (tsdocComment === undefined) {
		return [];
	}

	const errors: string[] = [];

	const summaryErrors = checkLinkTagsUnderTsdocNode(
		tsdocComment.summarySection,
		apiItem,
		apiModel,
		logger,
	);
	errors.push(...summaryErrors);

	if (tsdocComment.deprecatedBlock !== undefined) {
		const deprecatedBlockErrors = checkLinkTagsUnderTsdocNode(
			tsdocComment.deprecatedBlock,
			apiItem,
			apiModel,
			logger,
		);
		errors.push(...deprecatedBlockErrors);
	}

	if (tsdocComment.remarksBlock !== undefined) {
		const remarksBlockErrors = checkLinkTagsUnderTsdocNode(
			tsdocComment.remarksBlock,
			apiItem,
			apiModel,
			logger,
		);
		errors.push(...remarksBlockErrors);
	}

	if (tsdocComment.privateRemarks !== undefined) {
		const privateRemarksBlockErrors = checkLinkTagsUnderTsdocNode(
			tsdocComment.privateRemarks,
			apiItem,
			apiModel,
			logger,
		);
		errors.push(...privateRemarksBlockErrors);
	}

	const parametersErrors = checkLinkTagsUnderTsdocNodes(
		tsdocComment.params.blocks,
		apiItem,
		apiModel,
		logger,
	);
	errors.push(...parametersErrors);

	const typeParametersErrors = checkLinkTagsUnderTsdocNodes(
		tsdocComment.typeParams.blocks,
		apiItem,
		apiModel,
		logger,
	);
	errors.push(...typeParametersErrors);

	const customBlocksErrors = checkLinkTagsUnderTsdocNodes(
		tsdocComment.customBlocks,
		apiItem,
		apiModel,
		logger,
	);
	errors.push(...customBlocksErrors);

	return errors;
}

function checkLinkTagsUnderTsdocNode(
	node: DocNode,
	apiItem: ApiItem,
	apiModel: ApiModel,
	logger: Logger,
): readonly string[] {
	switch (node.kind) {
		// Nodes under which links cannot occur
		case DocNodeKind.CodeSpan:
		case DocNodeKind.BlockTag:
		case DocNodeKind.EscapedText:
		case DocNodeKind.FencedCode:
		case DocNodeKind.HtmlStartTag:
		case DocNodeKind.HtmlEndTag:
		case DocNodeKind.InheritDocTag:
		case DocNodeKind.PlainText:
		case DocNodeKind.SoftBreak: {
			return [];
		}
		case DocNodeKind.Block:
		case DocNodeKind.ParamBlock: {
			assert(node instanceof DocBlock, 'Expected a "DocBlock" node.');
			return checkLinkTagsUnderTsdocNode(node.content, apiItem, apiModel, logger);
		}
		// Nodes with children
		case DocNodeKind.Paragraph:
		case DocNodeKind.Section: {
			assert(node instanceof DocNodeContainer, 'Expected a "DocNodeContainer" node.');
			return checkLinkTagsUnderTsdocNodes(node.nodes, apiItem, apiModel, logger);
		}
		case DocNodeKind.InlineTag: {
			assert(node instanceof DocInlineTag, 'Expected a "DocInlineTag" node.');

			// If the tag is a "@link" tag, then the parser was unable to parse it correctly.
			// This is indicative of a syntax error in the tag, and therefore should be reported.
			if (node.tagName in ["@link", "@inheritDoc"]) {
				return [
					`Malformed "${
						node.tagName
					}" tag encountered on "${getScopedMemberNameForDiagnostics(apiItem)}": "${
						node.tagContent
					}".
For correct syntax, see <https://tsdoc.org/pages/tags/link/>.`,
				];
			}
			return [];
		}
		case DocNodeKind.LinkTag: {
			const result = checkLinkTag(node as DocLinkTag, apiItem, apiModel);
			return result === undefined ? [] : [result];
		}
		default: {
			logger.error(`Unsupported DocNode kind: "${node.kind}".`, node);
			throw new Error(`Unsupported DocNode kind: "${node.kind}".`);
			// return [];
		}
	}
}

function checkLinkTagsUnderTsdocNodes(
	nodes: readonly DocNode[],
	apiItem: ApiItem,
	apiModel: ApiModel,
	logger: Logger,
): readonly string[] {
	const errors: string[] = [];
	for (const node of nodes) {
		errors.push(...checkLinkTagsUnderTsdocNode(node, apiItem, apiModel, logger));
	}
	return errors;
}

function checkLinkTag(node: DocLinkTag, apiItem: ApiItem, apiModel: ApiModel): string | undefined {
	// If the link tag was parsed correctly (which we know it was in this case, because we have a `DocLinkTag`), then we don't have to worry about syntax validation.

	// If the link points to some external URL, no-op.
	// In the future, we could potentially leverage some sort of URL validator here,
	// but for now our primary concern is validating symbolic links.
	if (node.urlDestination !== undefined) {
		return undefined;
	}

	assert(
		node.codeDestination !== undefined,
		"Expected a `codeDestination` or `urlDestination` to be defined, but neither was.",
	);

	// If the link is a symbolic reference, validate it.
	try {
		resolveSymbolicReference(apiItem, node.codeDestination, apiModel);
	} catch (error: unknown) {
		assert(error instanceof Error, "Expected an error.");
		return error.message;
	}

	return undefined;
}

// eslint-disable-next-line unicorn/prevent-abbreviations
function checkInheritDocTag(apiItem: ApiDocumentedItem, apiModel: ApiModel): string | undefined {
	// eslint-disable-next-line unicorn/prevent-abbreviations
	const inheritDocTag: DocInheritDocTag | undefined = apiItem.tsdocComment?.inheritDocTag;

	if (inheritDocTag?.declarationReference !== undefined) {
		try {
			resolveSymbolicReference(apiItem, inheritDocTag.declarationReference, apiModel);
		} catch (error: unknown) {
			return (error as Error).message;
		}

		return undefined;
	}
	return undefined;
}
