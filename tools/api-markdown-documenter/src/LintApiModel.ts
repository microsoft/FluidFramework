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
import { resolveSymbolicReference } from "./utilities/index.js";
import type { ConfigurationBase } from "./ConfigurationBase.js";

/**
 * {@link lintApiModel} configuration.
 */
export interface LintApiModelConfiguration extends ConfigurationBase {
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
 */
export interface ReferenceError {
	/**
	 * The tag name with the invalid reference.
	 */
	readonly tagName: string;

	/**
	 * Name of the item that included a reference to an invalid target.
	 */
	readonly sourceItem: string;

	/**
	 * The name of the package that the {@link ReferenceError.sourceItem} belongs to.
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
 * An error resulting from a malformed TSDoc tag.
 */
export interface MalformedTagError {
	/**
	 * The tag name that was malformed.
	 */
	readonly tagName: string;

	/**
	 * Inner contents of the inline reference tag, if any.
	 */
	readonly tagContent: string | undefined;

	/**
	 * The name of the API item with which the documentation containing the malformed tag is associated.
	 */
	readonly associatedItem: string;

	/**
	 * The name of the package that the {@link ReferenceError.sourceItem} belongs to.
	 */
	readonly packageName: string;
}

/**
 * Mutable {@link LinterErrors}.
 * @remarks Used while walking the API model to accumulate errors, and converted to {@link LinterErrors} to return to the caller.
 */
interface MutableLinterErrors {
	readonly malformedTagErrors: Set<MalformedTagError>;
	readonly referenceErrors: Set<ReferenceError>;
}

/**
 * Errors found during linting.
 */
export interface LinterErrors {
	/**
	 * Errors resulting from malformed TSDoc tags.
	 */
	readonly malformedTagErrors: ReadonlySet<MalformedTagError>;

	/**
	 * Errors related to reference tags (e.g., `link` or `inheritDoc` tags) with invalid targets.
	 */
	readonly referenceErrors: ReadonlySet<ReferenceError>;
}

/**
 * Validates the given API model.
 *
 * @returns The set of errors encountered during linting, if any were found.
 * Otherwise, `undefined`.
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
		malformedTagErrors: new Set<MalformedTagError>(),
		referenceErrors: new Set<ReferenceError>(),
	};
	lintApiItem(apiModel, apiModel, optionsWithDefaults, errors);
	const anyErrors = errors.malformedTagErrors.size > 0 || errors.referenceErrors.size > 0;

	logger.verbose("API model linting completed.");
	logger.verbose(`Linting result: ${anyErrors ? "failure" : "success"}.`);

	return anyErrors
		? {
				malformedTagErrors: errors.malformedTagErrors,
				referenceErrors: errors.referenceErrors,
		  }
		: undefined;
}

/**
 * Recursively validates the given API item and all its descendants within the API model.
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
		case DocNodeKind.Block:
		case DocNodeKind.ParamBlock: {
			assert(node instanceof DocBlock, 'Expected a "DocBlock" node.');
			checkTagsUnderTsdocNode(node.content, associatedItem, apiModel, errors);
			break;
		}
		// Nodes with children
		case DocNodeKind.Paragraph:
		case DocNodeKind.Section: {
			assert(node instanceof DocNodeContainer, 'Expected a "DocNodeContainer" node.');
			checkTagsUnderTsdocNodes(node.nodes, associatedItem, apiModel, errors);
			break;
		}
		case DocNodeKind.InlineTag: {
			assert(node instanceof DocInlineTag, 'Expected a "DocInlineTag" node.');

			// If the tag is a "@link" tag, then the parser was unable to parse it correctly.
			// This is indicative of a syntax error in the tag, and therefore should be reported.
			if (node.tagName in ["@link", "@inheritDoc"]) {
				errors.malformedTagErrors.add({
					tagName: node.tagName,
					tagContent: node.tagContent,
					associatedItem: associatedItem.getScopedNameWithinPackage(),
					packageName:
						associatedItem.getAssociatedPackage()?.name ??
						fail("Package name not found"),
				});
			}
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
			fail(
				"Encountered an @inheritDoc tag while walking a TSDoc tree. API-Extractor resolves such tags at a higher level, so this is unexpected.",
			);
		}
		default: {
			throw new Error(`Unsupported DocNode kind: "${node.kind}".`);
		}
	}
}

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

function checkLinkTag(
	linkTag: DocLinkTag,
	apiItem: ApiItem,
	apiModel: ApiModel,
): ReferenceError | undefined {
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
	} catch (error: unknown) {
		assert(error instanceof Error, "Expected an error.");
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
): ReferenceError | undefined {
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
