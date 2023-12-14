/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ApiClass,
	ApiDeclaredItem,
	ApiDocumentedItem,
	type ApiEntryPoint,
	ApiInterface,
	type ApiItem,
	type ApiItemKind,
	ApiReturnTypeMixin,
	type Excerpt,
	ExcerptTokenKind,
	type HeritageType,
	type IResolveDeclarationReferenceResult,
	type TypeParameter,
} from "@microsoft/api-extractor-model";
import {
	type DocNode,
	type DocNodeContainer,
	DocNodeKind,
	type DocPlainText,
	type DocSection,
} from "@microsoft/tsdoc";

import { type Heading } from "../../Heading";
import {
	type DocumentationNode,
	DocumentationNodeType,
	type DocumentationParentNode,
	FencedCodeBlockNode,
	HeadingNode,
	LineBreakNode,
	LinkNode,
	ParagraphNode,
	PlainTextNode,
	SectionNode,
	type SingleLineDocumentationNode,
	SingleLineSpanNode,
	SpanNode,
	UnorderedListNode,
} from "../../documentation-domain";
import { type Logger } from "../../Logging";
import {
	type ApiFunctionLike,
	injectSeparator,
	getQualifiedApiItemName,
	getSeeBlocks,
	getThrowsBlocks,
	getDeprecatedBlock,
	getExampleBlocks,
	getReturnsBlock,
} from "../../utilities";
import {
	doesItemKindRequireOwnDocument,
	doesItemRequireOwnDocument,
	getAncestralHierarchy,
	getLinkForApiItem,
} from "../ApiItemTransformUtilities";
import { transformTsdocSection } from "../TsdocNodeTransforms";
import { getTsdocNodeTransformationOptions } from "../Utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createParametersSummaryTable, createTypeParametersSummaryTable } from "./TableHelpers";

/**
 * Generates a section for an API signature.
 *
 * @remarks Displayed as a heading with a code-block under it.
 *
 * @param apiItem - The API item whose signature will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if there was any signature content to render, otherwise `undefined`.
 *
 * @public
 */
export function createSignatureSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	if (apiItem instanceof ApiDeclaredItem) {
		const signatureExcerpt = apiItem.getExcerptWithModifiers();
		if (signatureExcerpt !== "") {
			const contents: DocumentationNode[] = [];

			contents.push(
				FencedCodeBlockNode.createFromPlainText(signatureExcerpt.trim(), "typescript"),
			);

			const renderedHeritageTypes = createHeritageTypesParagraph(apiItem, config);
			if (renderedHeritageTypes !== undefined) {
				contents.push(renderedHeritageTypes);
			}

			return wrapInSection(contents, {
				title: "Signature",
				id: `${getQualifiedApiItemName(apiItem)}-signature`,
			});
		}
	}
	return undefined;
}

/**
 * Generates a section for an API item's {@link https://tsdoc.org/pages/tags/see/ | @see} comment blocks.
 *
 * @remarks Displayed as a "See also" heading, followed by the contents of the API item's `@see` comment blocks
 * merged into a single section.
 *
 * @param apiItem - The API item whose `@see` comment blocks will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if there was any signature content to render, otherwise `undefined`.
 *
 * @public
 */
export function createSeeAlsoSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	const seeBlocks = getSeeBlocks(apiItem);
	if (seeBlocks === undefined || seeBlocks.length === 0) {
		return undefined;
	}

	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);

	const contents = seeBlocks.map((seeBlock) =>
		transformTsdocSection(seeBlock, tsdocNodeTransformOptions),
	);

	return wrapInSection(contents, {
		title: "See Also",
		id: `${getQualifiedApiItemName(apiItem)}-see-also`,
	});
}

/**
 * Renders a section listing types extended / implemented by the API item, if any.
 *
 * @remarks Displayed as a heading with a comma-separated list of heritage types by catagory under it.
 *
 * @param apiItem - The API item whose heritage types will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The paragraph containing heritage type information, if any is present. Otherwise `undefined`.
 */
export function createHeritageTypesParagraph(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ParagraphNode | undefined {
	const { logger } = config;

	const contents: ParagraphNode[] = [];

	if (apiItem instanceof ApiClass) {
		// Render `extends` type if there is one.
		if (apiItem.extendsType) {
			const extendsTypesSpan = createHeritageTypeListSpan(
				[apiItem.extendsType],
				"Extends",
				config,
			);

			if (extendsTypesSpan === undefined) {
				logger.error(
					'No content was rendered for non-empty "extends" type list. This is not expected.',
				);
			} else {
				contents.push(new ParagraphNode([extendsTypesSpan]));
			}
		}

		// Render `implements` types if there are any.
		const renderedImplementsTypes = createHeritageTypeListSpan(
			apiItem.implementsTypes,
			"Implements",
			config,
		);
		if (renderedImplementsTypes !== undefined) {
			contents.push(new ParagraphNode([renderedImplementsTypes]));
		}

		// Render type parameters if there are any.
		const renderedTypeParameters = createTypeParametersSection(
			apiItem.typeParameters,
			apiItem,
			config,
		);
		if (renderedTypeParameters !== undefined) {
			contents.push(new ParagraphNode([renderedTypeParameters]));
		}
	}

	if (apiItem instanceof ApiInterface) {
		// Render `extends` types if there are any.
		const renderedExtendsTypes = createHeritageTypeListSpan(
			apiItem.extendsTypes,
			"Extends",
			config,
		);
		if (renderedExtendsTypes !== undefined) {
			contents.push(new ParagraphNode([renderedExtendsTypes]));
		}

		// Render type parameters if there are any.
		const renderedTypeParameters = createTypeParametersSection(
			apiItem.typeParameters,
			apiItem,
			config,
		);
		if (renderedTypeParameters !== undefined) {
			contents.push(new ParagraphNode([renderedTypeParameters]));
		}
	}

	if (contents.length === 0) {
		return undefined;
	}

	// If only 1 child paragraph, prevent creating unecessary hierarchy here by not wrapping it.
	if (contents.length === 1) {
		return contents[0];
	}

	return new ParagraphNode(contents);
}

/**
 * Renders a labeled, comma-separated list of heritage types.
 *
 * @remarks Displayed as `<label>: <heritage-type>[, <heritage-type>]*`
 *
 * @param heritageTypes - List of types to display.
 * @param label - Label text to display before the list of types.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createHeritageTypeListSpan(
	heritageTypes: readonly HeritageType[],
	label: string,
	config: Required<ApiItemTransformationConfiguration>,
): SpanNode | undefined {
	if (heritageTypes.length > 0) {
		const renderedLabel = SpanNode.createFromPlainText(`${label}: `, { bold: true });

		// Build up array of excerpt entries
		const renderedHeritageTypes: SpanNode[] = [];
		for (const heritageType of heritageTypes) {
			const renderedExcerpt = createExcerptSpanWithHyperlinks(heritageType.excerpt, config);
			if (renderedExcerpt !== undefined) {
				renderedHeritageTypes.push(renderedExcerpt);
			}
		}

		const renderedList = injectSeparator<DocumentationNode>(
			renderedHeritageTypes,
			new PlainTextNode(", "),
		);

		return new SpanNode([renderedLabel, ...renderedList]);
	}
	return undefined;
}

/**
 * Renders a section describing the type parameters..
 * I.e. {@link https://tsdoc.org/pages/tags/typeparam/ | @typeParam} comment blocks.
 *
 * @remarks Displayed as a labeled, comma-separated list of types.
 * Links will be generated for types that are a part of the same API suite (model).
 *
 * @param typeParameters - List of type parameters associated with some API item.
 * @param contextApiItem - The API item with which the example is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if any type parameters were provided, otherwise `undefined`.
 *
 * @public
 */
export function createTypeParametersSection(
	typeParameters: readonly TypeParameter[],
	contextApiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	if (typeParameters.length === 0) {
		return undefined;
	}

	const typeParametersTable = createTypeParametersSummaryTable(
		typeParameters,
		contextApiItem,
		config,
	);

	return new SectionNode(
		[typeParametersTable],
		HeadingNode.createFromPlainText("Type Parameters"),
	);
}

/**
 * Renders a doc paragraph for the provided TSDoc excerpt.
 *
 * @remarks This function is a helper to parse TSDoc excerpt token syntax into documentation with the appropriate links.
 * It will generate links to any API members that are a part of the same API suite (model). Other token contents
 * will be rendered as plain text.
 *
 * @param excerpt - The TSDoc excerpt to render.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns A span containing the rendered contents, if non-empty.
 * Otherwise, will return `undefined`.
 */
export function createExcerptSpanWithHyperlinks(
	excerpt: Excerpt,
	config: Required<ApiItemTransformationConfiguration>,
): SingleLineSpanNode | undefined {
	if (excerpt.isEmpty) {
		return undefined;
	}

	const children: SingleLineDocumentationNode[] = [];
	for (const token of excerpt.spannedTokens) {
		// Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
		// the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
		// discard any newlines and let the renderer do normal word-wrapping.
		const unwrappedTokenText: string = token.text.replace(/[\n\r]+/g, " ");

		let wroteHyperlink = false;

		// If it's hyperlink-able, then append a DocLinkTag
		if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference) {
			const apiItemResult: IResolveDeclarationReferenceResult =
				config.apiModel.resolveDeclarationReference(token.canonicalReference, undefined);

			if (apiItemResult.resolvedApiItem) {
				const link = getLinkForApiItem(
					apiItemResult.resolvedApiItem,
					config,
					unwrappedTokenText,
				);
				children.push(LinkNode.createFromPlainTextLink(link));
				wroteHyperlink = true;
			}
		}

		// If the token was not one from which we generated hyperlink text, write as plain text instead
		if (!wroteHyperlink) {
			children.push(new PlainTextNode(unwrappedTokenText));
		}
	}

	return new SingleLineSpanNode(children);
}

/**
 * Renders a simple navigation breadcrumb.
 *
 * @remarks Displayed as a ` > `-separated list of hierarchical page links.
 * 1 for each element in the provided item's ancestory for which a separate document is generated
 * (see {@link DocumentBoundaries}).
 *
 * @param apiItem - The API item whose ancestory will be used to generate the breadcrumb.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @public
 */
export function createBreadcrumbParagraph(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ParagraphNode {
	// Get ordered ancestry of document items
	const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
		doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries),
	).reverse(); // Reverse from ascending to descending order

	const breadcrumbSeparator = new PlainTextNode(" > ");

	const links = ancestry.map((hierarchyItem) =>
		LinkNode.createFromPlainTextLink(getLinkForApiItem(hierarchyItem, config)),
	);

	// Add link for current document item
	links.push(LinkNode.createFromPlainTextLink(getLinkForApiItem(apiItem, config)));

	// Inject breadcrumb separator between each link
	const contents: DocumentationNode[] = injectSeparator<DocumentationNode>(
		links,
		breadcrumbSeparator,
	);

	return new ParagraphNode(contents);
}

/**
 * Alert text used in {@link alphaWarningSpan}.
 */
export const alphaWarningText: string =
	"WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.";

/**
 * A simple italic span containing a warning about using `@alpha` APIs.
 */
export const alphaWarningSpan = SpanNode.createFromPlainText(alphaWarningText, { bold: true });

/**
 * Alert text used in {@link betaWarningSpan}.
 */
export const betaWarningText: string =
	"WARNING: This API is provided as a beta preview and may change without notice. Use at your own risk.";

/**
 * A simple italic span containing a warning about using `@beta` APIs.
 */
export const betaWarningSpan = SpanNode.createFromPlainText(betaWarningText, { bold: true });

/**
 * Renders a section containing the API item's summary comment if it has one.
 *
 * @param apiItem - The API item whose summary documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @public
 */
export function createSummaryParagraph(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ParagraphNode | undefined {
	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);
	return apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined
		? transformTsdocSection(apiItem.tsdocComment.summarySection, tsdocNodeTransformOptions)
		: undefined;
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/remarks/ | @remarks} documentation of the
 * provided API item, if it has any.
 *
 * @remarks Displayed as a heading, with the documentation contents under it.
 *
 * @param apiItem - The API item whose `@remarks` documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 *
 * @public
 */
export function createRemarksSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	if (
		!(apiItem instanceof ApiDocumentedItem) ||
		apiItem.tsdocComment?.remarksBlock === undefined
	) {
		return undefined;
	}

	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);

	return wrapInSection(
		[
			transformTsdocSection(
				apiItem.tsdocComment.remarksBlock.content,
				tsdocNodeTransformOptions,
			),
		],
		{ title: "Remarks", id: `${getQualifiedApiItemName(apiItem)}-remarks` },
	);
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/throws/ | @throws} documentation of the
 * provided API item, if it has any.
 *
 * @remarks Displayed as a heading, with the documentation contents under it.
 *
 * @param apiItem - The API item whose `@throws` documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param headingText - The text to use for the heading in the throws section. Defaults to "Throws".
 *
 * @returns The doc section if the API item had any `@throws` comments, otherwise `undefined`.
 *
 * @public
 */
export function createThrowsSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
	headingText: string = "Throws",
): SectionNode | undefined {
	const throwsBlocks = getThrowsBlocks(apiItem);
	if (throwsBlocks === undefined || throwsBlocks.length === 0) {
		return undefined;
	}

	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);

	const paragraphs = throwsBlocks.map((throwsBlock) =>
		transformTsdocSection(throwsBlock, tsdocNodeTransformOptions),
	);

	return wrapInSection(paragraphs, {
		title: headingText,
		id: `${getQualifiedApiItemName(apiItem)}-throws`,
	});
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/deprecated/ | @deprecated} notice documentation
 * of the provided API item if it is annotated as `@deprecated`.
 *
 * @remarks Displayed as a simple note box containing the deprecation notice comment.
 *
 * @param apiItem - The API item whose `@deprecated` documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 *
 * @public
 */
export function createDeprecationNoticeSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): ParagraphNode | undefined {
	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);

	const deprecatedBlock = getDeprecatedBlock(apiItem);
	if (deprecatedBlock === undefined) {
		return undefined;
	}

	return new ParagraphNode([
		SpanNode.createFromPlainText(
			"WARNING: This API is deprecated and will be removed in a future release.",
			{ bold: true },
		),
		LineBreakNode.Singleton,
		new SpanNode([transformTsdocSection(deprecatedBlock, tsdocNodeTransformOptions)], {
			italic: true,
		}),
	]);
}

/**
 * Renders a section containing any {@link https://tsdoc.org/pages/tags/example/ | @example} documentation of the
 * provided API item if it has any.
 *
 * @remarks
 *
 * Each example will be displayed under its own heading.
 *
 * If there is only 1 example comment, all example headings will be parented under a top level "Examples" heading.
 *
 * @param apiItem - The API item whose `@example` documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param headingText - The text to use for the heading in the examples section. Defaults to "Examples".
 *
 * @returns The doc section if the API item had any `@example` comment blocks, otherwise `undefined`.
 *
 * @public
 */
export function createExamplesSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
	headingText: string = "Examples",
): SectionNode | undefined {
	const exampleBlocks = getExampleBlocks(apiItem);

	if (exampleBlocks === undefined || exampleBlocks.length === 0) {
		return undefined;
	}

	// If there is only 1 example, render it with a single default (un-numbered) heading
	if (exampleBlocks.length === 1) {
		return createExampleSection({ apiItem, content: exampleBlocks[0] }, config);
	}

	const exampleSections: SectionNode[] = [];
	for (const [i, exampleBlock] of exampleBlocks.entries()) {
		const exampleNumber = i + 1; // i is 0-based, but we want our example numbers to be 1-based.
		exampleSections.push(
			createExampleSection({ apiItem, content: exampleBlock, exampleNumber }, config),
		);
	}

	return wrapInSection(exampleSections, {
		title: headingText,
		id: `${getQualifiedApiItemName(apiItem)}-examples`,
	});
}

/**
 * Represents a single {@link https://tsdoc.org/pages/tags/example/ | @example} comment block for a given API item.
 */
interface ExampleProperties {
	/**
	 * The API item the example doc content belongs to.
	 */
	apiItem: ApiItem;

	/**
	 * `@example` comment body.
	 */
	content: DocSection;

	/**
	 * Example number. Used to disambiguate multiple `@example` comment headings numerically when there is more than 1.
	 * If not specified, example heading will not be labeled with a number.
	 *
	 * @remarks The example number will not be displayed if the example has a title.
	 */
	exampleNumber?: number;
}

/**
 * Renders a section containing a single {@link https://tsdoc.org/pages/tags/example/ | @example} documentation comment.
 *
 * @remarks
 *
 * Displayed as a heading with the example body under it.
 *
 * Per the `TSDoc` spec linked above, the example heading is generated as follows:
 *
 * If the `@example` content has text on the first line (the same line as the `@example` tag), that text content is
 * treated as the example's "title", used in the heading text (and is not included in the content body).
 *
 * Otherwise, the heading is generated as "Example[ \<{@link ExampleProperties.exampleNumber}\>]".
 *
 * @example Example comment with title "Foo"
 *
 * An example comment with title "Foo" (regardless of `exampleNumber` value) will produce something like the following
 * (expressed in Markdown, heading levels will vary):
 *
 * ```markdown
 * # Example: Foo
 *
 * ...
 * ```
 *
 * @example Example comment without title, no `exampleNumber` provided
 *
 * An example comment without a title line, and with no `exampleNumber` value provided will generate content like
 * the following (expressed in Markdown, heading levels will vary):
 *
 * ```markdown
 * # Example
 *
 * ...
 * ```
 *
 * @example With no title and {@link ExampleProperties.exampleNumber} provided
 *
 * An example comment without a title line, and `exampleNumber` value of `2` will generate content like
 * the following (expressed in Markdown, heading levels will vary):
 *
 * ```markdown
 * # Example 2
 *
 * ...
 * ```
 *
 * @param example - The example comment to render.
 * @param contextApiItem - The API item with which the example is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The rendered {@link SectionNode}.
 */
function createExampleSection(
	example: ExampleProperties,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode {
	const { logger } = config;

	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(example.apiItem, config);
	let exampleParagraph: DocumentationParentNode = transformTsdocSection(
		example.content,
		tsdocNodeTransformOptions,
	);

	// Per TSDoc spec, if the `@example` comment has content on the same line as the tag,
	// that line is expected to be treated as the title.
	// This information is not provided to us directly, so instead we will walk the content tree
	// and see if the first leaf node is plain text. If it is, we will use that as the title (header).
	// If not (undefined), we will use the default heading scheme.
	// Reference: <https://tsdoc.org/pages/tags/example/>
	const exampleTitle = extractTitleFromExampleSection(example.content);

	const headingTitle =
		exampleTitle === undefined
			? example.exampleNumber === undefined
				? "Example"
				: `Example ${example.exampleNumber}`
			: `Example: ${exampleTitle}`;

	// If our example contained a title line, we need to strip that content out of the body.
	// Unfortunately, the input `DocNode` types are all class based, and do not expose their constructors, so it is
	// difficult to mutate or make surgical copies of their trees.
	// Instead, we will adjust the output we generated via the above transformation logic.
	if (exampleTitle !== undefined) {
		logger?.verbose(
			`Found example comment with title "${exampleTitle}". Adjusting output to adhere to TSDoc spec...`,
		);
		exampleParagraph = stripTitleFromParagraph(exampleParagraph, exampleTitle, logger);
	}

	const headingId = `${getQualifiedApiItemName(example.apiItem)}-example${
		example.exampleNumber ?? ""
	}`;

	return wrapInSection([exampleParagraph], {
		title: headingTitle,
		id: headingId,
	});
}

/**
 * Scans the input tree to see if the first leaf node is plain text. If it is, returns it. Otherwise, returns undefined.
 *
 * @remarks
 *
 * Per TSDoc spec, if the `@example` comment has content on the same line as the tag,
 * that line is expected to be treated as the title.
 *
 * This information is not provided to us directly, so instead we will walk the content tree
 * and see if the first leaf node is plain text. If it is, we will use that as the title (header).
 * If not (undefined), we will use the default heading scheme.
 *
 * Reference: {@link https://tsdoc.org/pages/tags/example/}
 */
function extractTitleFromExampleSection(sectionNode: DocSection): string | undefined {
	// Drill down to find first leaf node. If it is plain text (and not a line break),
	// use it as title.
	let currentNode: DocNode = sectionNode;
	// eslint-disable-next-line no-constant-condition
	while (true) {
		const children = (currentNode as Partial<DocNodeContainer>).nodes;

		if (children === undefined || children.length === 0) {
			if (currentNode.kind === DocNodeKind.PlainText) {
				return (currentNode as DocPlainText).text.trim();
			}

			return undefined;
		}
		currentNode = children[0];
	}
}

/**
 * Scans the input tree for the first leaf. We expect it to be a plain text node, whose text is the specified `title`.
 * If it is, we will make a copy of the input tree which omits that node and any subsequent line break nodes, and
 * return that copy.
 *
 * @remarks
 *
 * See {@link createExampleSection} for a more complete description of why this is needed.
 *
 * In short, we need to strip out the "title" line of the example in some cases.
 * But making edits to the input "DocNode" trees is difficult.
 * Instead, we will validate our assumptions about the generated output tree, and strip off the title if everything
 * is as we expect.
 *
 * In the case where the output is not in a form we expect, we will log an error and return the node we were given,
 * rather than making a copy.
 */
function stripTitleFromParagraph(
	node: DocumentationParentNode,
	title: string,
	logger: Logger | undefined,
): DocumentationParentNode {
	// Verify title matches text of first plain text in output.
	// This is an expected invariant. If this is not the case, then something has gone wrong.
	// Note: if we ever allow consumers to provide custom DocNode transformations, this invariant will likely
	// disappear, and this code will need to be updated to function differently.
	// Reference: <https://tsdoc.org/pages/tags/example/>
	const children = node.children;
	if (children.length === 0) {
		logger?.error(
			"Transformed example paragraph begins with empty parent node. This is unexpected and indicates a bug.",
		);
		return node;
	}

	const firstChild = children[0];
	if (firstChild.isParent) {
		const newFirstChild = stripTitleFromParagraph(
			firstChild as DocumentationParentNode,
			title,
			logger,
		);

		const newChildren: DocumentationNode[] = [newFirstChild, ...children.slice(1)];

		return {
			...node,
			children: newChildren,
			hasChildren: newChildren.length > 0,
		};
	}

	if (firstChild.isLiteral) {
		if (firstChild.type === DocumentationNodeType.PlainText) {
			const text = (firstChild as PlainTextNode).text;
			if (text === title) {
				// Remove from children, and remove any trailing line breaks
				const newChildren = children.slice(1);
				while (
					newChildren.length > 0 &&
					newChildren[0].type === DocumentationNodeType.LineBreak
				) {
					newChildren.shift();
				}
				return {
					...node,
					children: newChildren,
					hasChildren: newChildren.length > 0,
				};
			} else {
				logger?.error(
					"Transformed example paragraph does not begin with expected title. This is unexpected and indicates a bug.",
					`Expected: "${title}".`,
					`Found: "${text}".`,
				);
				return node;
			}
		} else {
			logger?.error(
				"Transformed example paragraph does not begin with plain text. This is unexpected and indicates a bug.",
			);
			return node;
		}
	}

	logger?.error(
		"Transformed example paragraph begins with a non-literal, non-parent node. This is unexpected and indicates a bug.",
	);
	return node;
}

/**
 * Renders a section describing the list of parameters (if any) of a function-like API item.
 *
 * @remarks Displayed as a heading with a table representing the different parameters under it.
 *
 * @param apiFunctionLike - The function-like API item whose parameters will be described.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if the item had any parameters, otherwise `undefined`.
 *
 * @public
 */
export function createParametersSection(
	apiFunctionLike: ApiFunctionLike,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	if (apiFunctionLike.parameters.length === 0) {
		return undefined;
	}

	return wrapInSection(
		[createParametersSummaryTable(apiFunctionLike.parameters, apiFunctionLike, config)],
		{
			title: "Parameters",
			id: `${getQualifiedApiItemName(apiFunctionLike)}-parameters`,
		},
	);
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/returns/ | @returns} documentation of the
 * provided API item, if it has one.
 *
 * @remarks Displayed as a heading, with the documentation contents and the return type under it.
 *
 * @param apiItem - The API item whose `@returns` documentation will be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The doc section if the API item had a `@returns` comment, otherwise `undefined`.
 *
 * @public
 */
export function createReturnsSection(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	const tsdocNodeTransformOptions = getTsdocNodeTransformationOptions(apiItem, config);

	const children: DocumentationNode[] = [];

	// Generate span from `@returns` comment
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		const returnsBlock = getReturnsBlock(apiItem);
		if (returnsBlock !== undefined) {
			children.push(transformTsdocSection(returnsBlock, tsdocNodeTransformOptions));
		}
	}

	// Generate paragraph with notes about the return type
	if (ApiReturnTypeMixin.isBaseClassOf(apiItem) && apiItem.returnTypeExcerpt.text.trim() !== "") {
		// Special case to detect when the return type is `void`.
		// We will skip declaring the return type in this case.
		// eslint-disable-next-line unicorn/no-lonely-if
		if (apiItem.returnTypeExcerpt.text.trim() !== "void") {
			const typeExcerptSpan = createExcerptSpanWithHyperlinks(
				apiItem.returnTypeExcerpt,
				config,
			);
			if (typeExcerptSpan !== undefined) {
				children.push(
					new ParagraphNode([
						SpanNode.createFromPlainText("Return type: ", { bold: true }),
						typeExcerptSpan,
					]),
				);
			}
		}
	}

	return children.length === 0
		? undefined
		: wrapInSection(children, {
				title: "Returns",
				id: `${getQualifiedApiItemName(apiItem)}-returns`,
		  });
}

/**
 * Represents a series API child items for which documentation sections will be generated.
 */
export interface ChildSectionProperties {
	/**
	 * Heading for the section being rendered.
	 */
	heading: Heading;

	/**
	 * The API item kind of all child items.
	 */
	itemKind: ApiItemKind;

	/**
	 * The child items to be rendered.
	 *
	 * @remarks Every item's `kind` must be `itemKind`.
	 */
	items: readonly ApiItem[];
}

/**
 * Renders a section describing child items of some API item, grouped by `kind`.
 *
 * @remarks Displayed as a series of subsequent sub-sections.
 *
 * Note: Rendering here will skip any items intended to be rendered to their own documents
 * (see {@link DocumentBoundaries}).
 * The assumption is that this is used to render child contents to the same document as the parent.
 *
 * @param childItems - The child sections to be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param createChildContent - Callback to render a given child item.
 *
 * @returns The doc section if there were any child contents to render, otherwise `undefined`.
 */
export function createChildDetailsSection(
	childItems: readonly ChildSectionProperties[],
	config: Required<ApiItemTransformationConfiguration>,
	createChildContent: (apiItem) => DocumentationNode[],
): SectionNode[] | undefined {
	const sections: SectionNode[] = [];

	for (const childItem of childItems) {
		// Only render contents for a section if the item kind is one that gets rendered to its parent's document
		// (i.e. it does not get rendered to its own document).
		// Also only render the section if it actually has contents to render (to avoid empty headings).
		if (
			!doesItemKindRequireOwnDocument(childItem.itemKind, config.documentBoundaries) &&
			childItem.items.length > 0
		) {
			const childContents: DocumentationNode[] = [];
			for (const item of childItem.items) {
				childContents.push(...createChildContent(item));
			}

			sections.push(wrapInSection(childContents, childItem.heading));
		}
	}

	return sections.length === 0 ? undefined : sections;
}

/**
 * Wraps the provided contents in a {@link SectionNode}.
 * @param nodes - The section's child contents.
 * @param heading - Optional heading to associate with the section.
 */
export function wrapInSection(nodes: DocumentationNode[], heading?: Heading): SectionNode {
	return new SectionNode(
		nodes,
		heading ? HeadingNode.createFromPlainTextHeading(heading) : undefined,
	);
}

/**
 * Creates an {@link UnorderedListNode} containing links to each of the specified entry-points.
 *
 * @param apiEntryPoints - The list of entry-points to display / link to.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createEntryPointList(
	apiEntryPoints: readonly ApiEntryPoint[],
	config: Required<ApiItemTransformationConfiguration>,
): UnorderedListNode | undefined {
	if (apiEntryPoints.length === 0) {
		return undefined;
	}

	return new UnorderedListNode(
		apiEntryPoints.map((entryPoint) =>
			LinkNode.createFromPlainTextLink(getLinkForApiItem(entryPoint, config)),
		),
	);
}
