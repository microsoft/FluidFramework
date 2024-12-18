/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "node:assert";

import {
	ApiDocumentedItem,
	type ApiItem,
	ApiItemContainerMixin,
	type ApiModel,
} from "@microsoft/api-extractor-model";
import {
	DocBlock,
	type DocComment,
	type DocInheritDocTag,
	DocInlineTag,
	type DocLinkTag,
	type DocNode,
	DocNodeContainer,
	DocNodeKind,
} from "@microsoft/tsdoc";

import { defaultConsoleLogger } from "./Logging.js";
import type { LoggingOptions } from "./LoggingOptions.js";
import { resolveSymbolicReference } from "./utilities/index.js";

/**
 * {@link lintApiModel} configuration.
 *
 * @beta
 */
export interface LintApiModelConfiguration extends LoggingOptions {
	/**
	 * The API model to lint.
	 */
	apiModel: ApiModel;
}

/**
 * {@link LintApiModelConfiguration} defaults.
 */
const defaultLintApiModelConfiguration: Required<Omit<LintApiModelConfiguration, "apiModel">> = {
	logger: defaultConsoleLogger,
};

// TODO: common TsdocError base (associatedItem, packageName)

/**
 * An error resulting from a reference tag (e.g., `link` or `inheritDoc` tags) with an invalid target.
 *
 * @beta
 */
export interface LinterReferenceError {
	/**
	 * The tag name with the invalid reference.
	 */
	readonly tagName: string;

	/**
	 * Name of the item that included a reference to an invalid target.
	 */
	readonly sourceItem: string;

	/**
	 * The name of the package that the {@link LinterReferenceError.sourceItem} belongs to.
	 */
	readonly packageName: string;

	/**
	 * The string provided as the reference in a reference tag.
	 */
	readonly referenceTarget: string;

	/**
	 * Link alias text, if any.
	 */
	readonly linkText: string | undefined;
}

/**
 * Mutable {@link LinterErrors}.
 * @remarks Used while walking the API model to accumulate errors, and converted to {@link LinterErrors} to return to the caller.
 */
interface MutableLinterErrors {
	readonly referenceErrors: Set<LinterReferenceError>;
}

/**
 * Errors found during linting.
 *
 * @beta
 */
export interface LinterErrors {
	// TODO: malformed tag errors

	/**
	 * Errors related to reference tags (e.g., `link` or `inheritDoc` tags) with invalid targets.
	 */
	readonly referenceErrors: ReadonlySet<LinterReferenceError>;

	// TODO: add other error kinds as needed.
}

/**
 * Validates the given API model.
 *
 * @returns The set of errors encountered during linting, if any were found.
 * Otherwise, `undefined`.
 *
 * @beta
 */
export async function lintApiModel(
	configuration: LintApiModelConfiguration,
): Promise<LinterErrors | undefined> {
	const optionsWithDefaults: Required<LintApiModelConfiguration> = {
		...defaultLintApiModelConfiguration,
		...configuration,
	};
	const { apiModel, logger } = optionsWithDefaults;

	logger.verbose("Linting API model...");

	const errors: MutableLinterErrors = {
		referenceErrors: new Set<LinterReferenceError>(),
	};
	lintApiItem(apiModel, apiModel, optionsWithDefaults, errors);
	const anyErrors = errors.referenceErrors.size > 0;

	logger.verbose("API model linting completed.");
	logger.verbose(`Linting result: ${anyErrors ? "failure" : "success"}.`);

	return anyErrors
		? {
				referenceErrors: errors.referenceErrors,
		  }
		: undefined;
}

/**
 * Recursively validates the given API item and all its descendants within the API model.
 *
 * @remarks Populates `errors` with any errors encountered during validation.
 */
function lintApiItem(
	apiItem: ApiItem,
	apiModel: ApiModel,
	options: Required<LintApiModelConfiguration>,
	errors: MutableLinterErrors,
): void {
	// If the item is documented, lint its documentation contents.
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		const comment = apiItem.tsdocComment;

		// Lint `@inheritDoc` tag, if present
		// Note: API-Extractor resolves `@inheritDoc` during model generation, so such tags are never expected to appear in the `tsdocComment` tree (unless malformed).
		// Therefore, we need to handle them specially here.
		if (comment.inheritDocTag !== undefined) {
			// eslint-disable-next-line unicorn/prevent-abbreviations
			const inheritDocReferenceError = checkInheritDocTag(
				comment.inheritDocTag,
				apiItem,
				apiModel,
			);
			if (inheritDocReferenceError !== undefined) {
				errors.referenceErrors.add(inheritDocReferenceError);
			}
		}

		// Check TSDoc contents
		lintComment(apiItem.tsdocComment, apiItem, apiModel, errors);
	}

	// If the item has children, recursively validate them.
	if (ApiItemContainerMixin.isBaseClassOf(apiItem)) {
		for (const member of apiItem.members) {
			lintApiItem(member, apiModel, options, errors);
		}
	}
}

/**
 * Validates a TSDoc comment associated with an API item.
 *
 * @remarks Populates `errors` with any errors encountered during validation.
 */
function lintComment(
	comment: DocComment,
	associatedItem: ApiDocumentedItem,
	apiModel: ApiModel,
	errors: MutableLinterErrors,
): void {
	checkTagsUnderTsdocNode(comment.summarySection, associatedItem, apiModel, errors);

	if (comment.deprecatedBlock !== undefined) {
		checkTagsUnderTsdocNode(comment.deprecatedBlock, associatedItem, apiModel, errors);
	}

	if (comment.remarksBlock !== undefined) {
		checkTagsUnderTsdocNode(comment.remarksBlock, associatedItem, apiModel, errors);
	}

	if (comment.privateRemarks !== undefined) {
		checkTagsUnderTsdocNode(comment.privateRemarks, associatedItem, apiModel, errors);
	}

	checkTagsUnderTsdocNodes(comment.params.blocks, associatedItem, apiModel, errors);

	checkTagsUnderTsdocNodes(comment.typeParams.blocks, associatedItem, apiModel, errors);

	checkTagsUnderTsdocNodes(comment.customBlocks, associatedItem, apiModel, errors);
}

/**
 * Validates the provided TSDoc node and its children.
 *
 * @remarks Populates `errors` with any errors encountered during validation.
 * Co-recursive with {@link checkTagsUnderTsdocNodes}.
 */
function checkTagsUnderTsdocNode(
	node: DocNode,
	associatedItem: ApiDocumentedItem,
	apiModel: ApiModel,
	errors: MutableLinterErrors,
): void {
	switch (node.kind) {
		// Nodes under which links cannot occur
		case DocNodeKind.CodeSpan:
		case DocNodeKind.BlockTag:
		case DocNodeKind.EscapedText:
		case DocNodeKind.FencedCode:
		case DocNodeKind.HtmlStartTag:
		case DocNodeKind.HtmlEndTag:
		case DocNodeKind.PlainText:
		case DocNodeKind.SoftBreak: {
			break;
		}
		// Nodes with children ("content")
		case DocNodeKind.Block:
		case DocNodeKind.ParamBlock: {
			assert(node instanceof DocBlock, 'Expected a "DocBlock" node.');
			checkTagsUnderTsdocNode(node.content, associatedItem, apiModel, errors);
			break;
		}
		// Nodes with children ("nodes")
		case DocNodeKind.Paragraph:
		case DocNodeKind.Section: {
			assert(node instanceof DocNodeContainer, 'Expected a "DocNodeContainer" node.');
			checkTagsUnderTsdocNodes(node.nodes, associatedItem, apiModel, errors);
			break;
		}
		case DocNodeKind.InlineTag: {
			assert(node instanceof DocInlineTag, 'Expected a "DocInlineTag" node.');
			// TODO: malformed tag errors
			break;
		}
		case DocNodeKind.LinkTag: {
			const result = checkLinkTag(node as DocLinkTag, associatedItem, apiModel);
			if (result !== undefined) {
				errors.referenceErrors.add(result);
			}
			break;
		}
		case DocNodeKind.InheritDocTag: {
			// See notes in `lintApiItem` for why we handle `@inheritDoc` tags are not expected or handled here.
			fail(
				"Encountered an @inheritDoc tag while walking a TSDoc tree. API-Extractor resolves such tags at a higher level, so this is unexpected.",
			);
		}
		default: {
			throw new Error(`Unsupported DocNode kind: "${node.kind}".`);
		}
	}
}

/**
 * Validates the provided TSDoc nodes and their children.
 *
 * @remarks Populates `errors` with any errors encountered during validation.
 * Co-recursive with {@link checkTagsUnderTsdocNode}.
 */
function checkTagsUnderTsdocNodes(
	nodes: readonly DocNode[],
	associatedItem: ApiDocumentedItem,
	apiModel: ApiModel,
	errors: MutableLinterErrors,
): void {
	for (const node of nodes) {
		checkTagsUnderTsdocNode(node, associatedItem, apiModel, errors);
	}
}

/**
 * Validates the provided link tag, ensuring that the target reference is valid within the API model.
 *
 * @returns An error, if the link tag's target reference is invalid.
 * Otherwise, `undefined`.
 */
function checkLinkTag(
	linkTag: DocLinkTag,
	apiItem: ApiItem,
	apiModel: ApiModel,
): LinterReferenceError | undefined {
	// If the link tag was parsed correctly (which we know it was in this case, because we have a `DocLinkTag`), then we don't have to worry about syntax validation.

	// If the link points to some external URL, no-op.
	// In the future, we could potentially leverage some sort of URL validator here,
	// but for now our primary concern is validating symbolic links.
	if (linkTag.urlDestination !== undefined) {
		return undefined;
	}

	assert(
		linkTag.codeDestination !== undefined,
		"Expected a `codeDestination` or `urlDestination` to be defined, but neither was.",
	);

	// If the link is a symbolic reference, validate it.
	try {
		resolveSymbolicReference(apiItem, linkTag.codeDestination, apiModel);
	} catch {
		return {
			tagName: "@link",
			sourceItem: apiItem.getScopedNameWithinPackage(),
			packageName: apiItem.getAssociatedPackage()?.name ?? fail("Package name not found"),
			referenceTarget: linkTag.codeDestination.emitAsTsdoc(),
			linkText: linkTag.linkText,
		};
	}

	return undefined;
}

/**
 * Checks the provided API item's `{@inheritDoc}` tag, ensuring that the target reference is valid within the API model.
 */
// eslint-disable-next-line unicorn/prevent-abbreviations
function checkInheritDocTag(
	// eslint-disable-next-line unicorn/prevent-abbreviations
	inheritDocTag: DocInheritDocTag,
	associatedItem: ApiDocumentedItem,
	apiModel: ApiModel,
): LinterReferenceError | undefined {
	if (inheritDocTag?.declarationReference === undefined) {
		return undefined;
	}

	try {
		resolveSymbolicReference(associatedItem, inheritDocTag.declarationReference, apiModel);
	} catch {
		return {
			tagName: "@inheritDoc",
			sourceItem: associatedItem.getScopedNameWithinPackage(),
			packageName:
				associatedItem.getAssociatedPackage()?.name ?? fail("Package name not found"),
			referenceTarget: inheritDocTag.declarationReference.emitAsTsdoc(),
			linkText: undefined,
		};
	}

	return undefined;
}
