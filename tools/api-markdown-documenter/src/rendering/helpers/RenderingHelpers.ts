/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiClass,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiReturnTypeMixin,
    Excerpt,
    ExcerptTokenKind,
    HeritageType,
    IResolveDeclarationReferenceResult,
    TypeParameter,
} from "@microsoft/api-extractor-model";
import {
    DocFencedCode,
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { Heading } from "../../Heading";
import { Link } from "../../Link";
import {
    DocAlert,
    DocAlertType,
    DocEmphasisSpan,
    DocHeading,
    DocList,
    ListKind,
} from "../../doc-nodes";
import {
    ApiFunctionLike,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getDeprecatedBlock,
    getExampleBlocks,
    getHeadingForApiItem,
    getLinkForApiItem,
    getQualifiedApiItemName,
    getReturnsBlock,
    getSeeBlocks,
    getThrowsBlocks,
    mergeSections,
} from "../../utilities";
import { renderParametersSummaryTable } from "./TableRenderingHelpers";

/**
 * Renders a section for an API signature.
 *
 * @remarks Displayed as a heading with a code-block under it.
 *
 * @param apiItem - The API item whose signature will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if there was any signature content to render, otherwise `undefined`.
 */
export function renderSignature(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDeclaredItem) {
        const signatureExcerpt = apiItem.getExcerptWithModifiers();
        if (signatureExcerpt !== "") {
            const docNodes: DocNode[] = [];
            docNodes.push(
                renderHeading(
                    {
                        title: "Signature",
                        id: `${getQualifiedApiItemName(apiItem)}-signature`,
                    },
                    config,
                ),
            );
            docNodes.push(
                new DocFencedCode({
                    configuration: config.tsdocConfiguration,
                    code: signatureExcerpt,
                    language: "typescript",
                }),
            );

            const renderedHeritageTypes = renderHeritageTypes(apiItem, config);
            if (renderedHeritageTypes !== undefined) {
                docNodes.push(renderedHeritageTypes);
            }

            return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
        }
    }
    return undefined;
}

/**
 * Renders a section for an API item's {@link https://tsdoc.org/pages/tags/see/ | @see} comment blocks.
 *
 * @remarks Displayed as a "See also" heading, followed by the contents of the API item's `@see` comment blocks
 * merged into a single section.
 *
 * @param apiItem - The API item whose `@see` comment blocks will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if there was any signature content to render, otherwise `undefined`.
 */
export function renderSeeAlso(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const seeBlocks = getSeeBlocks(apiItem);
    if (seeBlocks === undefined || seeBlocks.length === 0) {
        return undefined;
    }

    const docNodes: DocNode[] = [];
    docNodes.push(
        renderHeading(
            { title: "See also", id: `${getQualifiedApiItemName(apiItem)}-see-also` },
            config,
        ),
    );

    // Merge `@see` blocks together
    for (const seeBlock of seeBlocks) {
        docNodes.push(...seeBlock.nodes);
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}

/**
 * Renders a section listing types extended / implemented by the API item, if any.
 *
 * @remarks Displayed as a heading with a comma-separated list of heritage types by catagory under it.
 *
 * @param apiItem - The API item whose heritage types will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if there were any heritage types to render, otherwise `undefined`.
 */
export function renderHeritageTypes(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const docNodes: DocNode[] = [];

    if (apiItem instanceof ApiClass) {
        // Render `extends` type if there is one.
        if (apiItem.extendsType) {
            const renderedExtendsTypes = renderHeritageTypeList(
                [apiItem.extendsType],
                "Extends",
                config,
            );
            if (renderedExtendsTypes === undefined) {
                throw new Error(
                    'No content was rendered for non-empty "extends" type list. This should not be possible.',
                );
            }
            docNodes.push(renderedExtendsTypes);
        }

        // Render `implements` types if there are any.
        const renderedImplementsTypes = renderHeritageTypeList(
            apiItem.implementsTypes,
            "Implements",
            config,
        );
        if (renderedImplementsTypes !== undefined) {
            docNodes.push(renderedImplementsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters, config);
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    if (apiItem instanceof ApiInterface) {
        // Render `extends` types if there are any.
        const renderedExtendsTypes = renderHeritageTypeList(
            apiItem.extendsTypes,
            "Extends",
            config,
        );
        if (renderedExtendsTypes !== undefined) {
            docNodes.push(renderedExtendsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters, config);
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}

/**
 * Renders a labeled, comma-separated list of heritage types.
 *
 * @remarks Displayed as `<label>: <heritage-type>[, <heritage-type>]*`
 *
 * @param heritageTypes - List of types to display.
 * @param label - Label text to display before the list of types.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
function renderHeritageTypeList(
    heritageTypes: readonly HeritageType[],
    label: string,
    config: Required<MarkdownDocumenterConfiguration>,
): DocParagraph | undefined {
    if (heritageTypes.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                new DocPlainText({
                    configuration: config.tsdocConfiguration,
                    text: `${label}: `,
                }),
            ]),
        );

        let needsComma: boolean = false;
        for (const heritageType of heritageTypes) {
            if (needsComma) {
                docNodes.push(
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: ", ",
                    }),
                );
            }

            const renderedExcerpt = renderExcerptWithHyperlinks(heritageType.excerpt, config);
            if (renderedExcerpt !== undefined) {
                docNodes.push(...renderedExcerpt);
                needsComma = true;
            }
        }

        return new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes);
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
 * @param typeParameters - List of type
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if any type parameters were provided, otherwise `undefined`.
 */
export function renderTypeParameters(
    typeParameters: readonly TypeParameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (typeParameters.length > 0) {
        const listItemNodes: DocNode[] = [];
        for (const typeParameter of typeParameters) {
            const paragraphNodes: DocNode[] = [];

            paragraphNodes.push(
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: typeParameter.name,
                    }),
                ]),
            );

            if (typeParameter.tsdocTypeParamBlock !== undefined) {
                paragraphNodes.push(
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: ": ",
                    }),
                );
                paragraphNodes.push(...typeParameter.tsdocTypeParamBlock.content.nodes);
            }

            listItemNodes.push(
                new DocParagraph({ configuration: config.tsdocConfiguration }, paragraphNodes),
            );
        }

        return new DocSection({ configuration: config.tsdocConfiguration }, [
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: "Type parameters: ",
                    }),
                ]),
            ]),
            new DocList(
                {
                    configuration: config.tsdocConfiguration,
                    listKind: ListKind.Unordered,
                },
                listItemNodes,
            ),
        ]);
    }
    return undefined;
}

/**
 * Renders a doc paragraph for the provided TSDoc excerpt.
 *
 * @remarks This function is a helper to parse TSDoc excerpt token syntax into documentation with the appropriate links.
 * It will generate links to any API members that are a part of the same API suite (model). Other token contents
 * will be rendered as plain text.
 *
 * @param excerpt - The TSDoc excerpt to render.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns A list of doc nodes containing the rendered contents, if the excerpt was non-empty.
 * Will return `undefined` otherwise.
 * This list of nodes is suitable to be placed in a `paragraph` or `section`, etc.
 */
export function renderExcerptWithHyperlinks(
    excerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): DocNode[] | undefined {
    if (excerpt.isEmpty) {
        return undefined;
    }

    const docNodes: DocNode[] = [];
    for (const token of excerpt.spannedTokens) {
        // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
        // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
        // discard any newlines and let the renderer do normal word-wrapping.
        const unwrappedTokenText: string = token.text.replace(/[\r\n]+/g, " ");

        let wroteHyperlink = false;

        // If it's hyperlink-able, then append a DocLinkTag
        if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference) {
            const apiItemResult: IResolveDeclarationReferenceResult =
                config.apiModel.resolveDeclarationReference(token.canonicalReference, undefined);

            if (apiItemResult.resolvedApiItem) {
                docNodes.push(
                    renderLink(
                        getLinkForApiItem(
                            apiItemResult.resolvedApiItem,
                            config,
                            unwrappedTokenText,
                        ),
                        config,
                    ),
                );
                wroteHyperlink = true;
            }
        }

        // If the token was not one from which we generated hyperlink text, write as plain text instead
        if (!wroteHyperlink) {
            docNodes.push(
                new DocPlainText({
                    configuration: config.tsdocConfiguration,
                    text: unwrappedTokenText,
                }),
            );
        }
    }
    return docNodes;
}

/**
 * Renders a simple navigation breadcrumb.
 *
 * @remarks Displayed as a ` > `-separated list of hierarchical page links.
 * 1 for each element in the provided item's ancestory for which a separate document is generated
 * (see {@link DocumentBoundaries}).
 *
 * @param apiItem - The API item whose ancestory will be used to generate the breadcrumb.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderBreadcrumb(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // TODO: old system generated link text "Packages" for Model document

    const docNodes: DocNode[] = [];

    // Get ordered ancestry of document items
    const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
        doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries),
    ).reverse(); // Reverse from ascending to descending order

    const separator = new DocPlainText({
        configuration: config.tsdocConfiguration,
        text: " > ",
    });

    // Render ancestry links
    let writtenAnythingYet = false;
    for (const hierarchyItem of ancestry) {
        if (writtenAnythingYet) {
            docNodes.push(separator);
        }

        const link = getLinkForApiItem(hierarchyItem, config);
        docNodes.push(renderLink(link, config));

        writtenAnythingYet = true;
    }

    // Render entry for the item itself
    if (writtenAnythingYet) {
        docNodes.push(separator);
    }
    const link = getLinkForApiItem(apiItem, config);
    docNodes.push(renderLink(link, config));

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes),
    ]);
}

/**
 * Renders a heading for the API item, using the provided configuration policy for generating the link text and ID.
 *
 * @param apiItem - The API item for which the heading is being generated.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderHeadingForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocHeading {
    return renderHeading(getHeadingForApiItem(apiItem, config), config);
}

/**
 * Helper function for rendering a heading.
 *
 * @param heading - The description of the heading to render.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderHeading(
    heading: Heading,
    config: Required<MarkdownDocumenterConfiguration>,
): DocHeading {
    return new DocHeading({
        ...heading,
        configuration: config.tsdocConfiguration,
    });
}

/**
 * Renders a simple note box containing a standard warning about beta API usage considerations.
 *
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderBetaAlert(config: Required<MarkdownDocumenterConfiguration>): DocAlert {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocAlert(
        { configuration: config.tsdocConfiguration, type: DocAlertType.Danger },
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({
                configuration: config.tsdocConfiguration,
                text: betaWarning,
            }),
        ]),
    );
}

/**
 * Renders a section containing the API item's summary comment if it has one.
 */
export function renderSummarySection(apiItem: ApiItem): DocSection | undefined {
    return apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined
        ? apiItem.tsdocComment.summarySection
        : undefined;
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/remarks/ | @remarks} documentation of the
 * provided API item, if it has any.
 *
 * @remarks Displayed as a heading, with the documentation contents under it.
 *
 * @param apiItem - The API item whose `@remarks` documentation will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 */
export function renderRemarksSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.remarksBlock !== undefined) {
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            renderHeading(
                {
                    title: "Remarks",
                    id: `${getQualifiedApiItemName(apiItem)}-remarks`,
                },
                config,
            ),
            apiItem.tsdocComment.remarksBlock.content,
        ]);
    }
    return undefined;
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/throws/ | @throws} documentation of the
 * provided API item, if it has any.
 *
 * @remarks Displayed as a heading, with the documentation contents under it.
 *
 * @param apiItem - The API item whose `@throws` documentation will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the API item had any `@throws` comments, otherwise `undefined`.
 */
export function renderThrowsSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const throwsBlocks = getThrowsBlocks(apiItem);
    if (throwsBlocks === undefined || throwsBlocks.length === 0) {
        return undefined;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            {
                title: "Throws",
                id: `${getQualifiedApiItemName(apiItem)}-throws`,
            },
            config,
        ),
        ...throwsBlocks,
    ]);
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/deprecated/ | @deprecated} notice documentation
 * of the provided API item if it has any.
 *
 * @remarks Displayed as a simple note box containing the deprecation notice comment.
 *
 * @param apiItem - The API item whose `@deprecated` documentation will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the API item had a `@remarks` comment, otherwise `undefined`.
 */
export function renderDeprecationNoticeSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const deprecatedBlock = getDeprecatedBlock(apiItem);
    if (deprecatedBlock === undefined) {
        return undefined;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        new DocAlert(
            {
                configuration: config.tsdocConfiguration,
                type: DocAlertType.Warning,
                title: "Deprecated",
            },
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                ...deprecatedBlock.nodes,
            ]),
        ),
    ]);
}

/**
 * Renders a section containing any {@link https://tsdoc.org/pages/tags/example/ | @example} documentation of the
 * provided API item if it has any.
 *
 * @remarks Displayed as 1 or more headings (1 for each example), with the example contents under them.
 * If there is more than 1 example comment, each example will be parented under a numbered heading under
 * an "Examples" heading.
 * If there is only 1 example comment, that comment will be rendered under a single "Example" heading.
 *
 * @param apiItem - The API item whose `@example` documentation will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the API item had any `@example` comment blocks, otherwise `undefined`.
 */
export function renderExamplesSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const exampleBlocks = getExampleBlocks(apiItem);

    if (exampleBlocks === undefined || exampleBlocks.length === 0) {
        return undefined;
    }

    // If there is only 1 example, render it with the default (un-numbered) heading
    if (exampleBlocks.length === 1) {
        return renderExampleSection({ apiItem, content: exampleBlocks[0] }, config);
    }

    const exampleSections: DocSection[] = [];
    for (let i = 0; i < exampleBlocks.length; i++) {
        exampleSections.push(
            renderExampleSection(
                { apiItem, content: exampleBlocks[i], exampleNumber: i + 1 },
                config,
            ),
        );
    }

    // Merge example sections into a single section to simplify hierarchy
    const mergedSection = mergeSections(exampleSections, config.tsdocConfiguration);

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            {
                title: "Examples",
                id: `${getQualifiedApiItemName(apiItem)}-examples`,
            },
            config,
        ),
        mergedSection,
    ]);
}

/**
 * Represents a single {@link https://tsdoc.org/pages/tags/example/ | @example} comment block for a given API item.
 */
export interface DocExampleProperties {
    /**
     * The API item the example doc content belongs to.
     */
    apiItem: ApiItem;

    /**
     * `@example` comment body.
     */
    content: DocSection;

    /**
     * Example number. Used to disambiguate multiple `@example` comment headings numerically.
     * If not specified, example heading will not be labeled with a number.
     */
    exampleNumber?: number;
}

/**
 * Renders a section containing a single {@link https://tsdoc.org/pages/tags/example/ | @example} documentation comment.
 *
 * @remarks Displayed as a heading with the example comment under it.
 *
 * @param example - The example to render.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderExampleSection(
    example: DocExampleProperties,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const headingTitle: string =
        example.exampleNumber === undefined ? "Example" : `Example ${example.exampleNumber}`;

    const headingId = `${getQualifiedApiItemName(example.apiItem)}-example${
        example.exampleNumber === undefined ? "" : example.exampleNumber
    }`;

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading({ title: headingTitle, id: headingId }, config),
        example.content,
    ]);
}

/**
 * Renders a section describing the list of parameters (if any) of a function-like API item.
 *
 * @remarks Displayed as a heading with a table representing the different parameters under it.
 *
 * @param apiFunctionLike - The function-like API item whose parameters will be described.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the item had any parameters, otherwise `undefined`.
 */
export function renderParametersSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiFunctionLike.parameters.length === 0) {
        return undefined;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            {
                title: "Parameters",
                id: `${getQualifiedApiItemName(apiFunctionLike)}-parameters`,
            },
            config,
        ),
        renderParametersSummaryTable(apiFunctionLike.parameters, config),
    ]);
}

/**
 * Renders a section containing the {@link https://tsdoc.org/pages/tags/returns/ | @returns} documentation of the
 * provided API item, if it has one.
 *
 * @remarks Displayed as a heading, with the documentation contents and the return type under it.
 *
 * @param apiItem - The API item whose `@returns` documentation will be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The doc section if the API item had a `@returns` comment, otherwise `undefined`.
 */
export function renderReturnsSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    const docSections: DocSection[] = [];

    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
        const returnsBlock = getReturnsBlock(apiItem);
        if (returnsBlock !== undefined) {
            docSections.push(returnsBlock);
        }
    }

    if (ApiReturnTypeMixin.isBaseClassOf(apiItem) && apiItem.returnTypeExcerpt.text.trim() !== "") {
        // Special case to detect when the return type is `void`.
        // We will skip declaring the return type in this case.
        if (apiItem.returnTypeExcerpt.text.trim() !== "void") {
            const renderedTypeExcerpt = renderExcerptWithHyperlinks(
                apiItem.returnTypeExcerpt,
                config,
            );
            if (renderedTypeExcerpt !== undefined) {
                docSections.push(
                    new DocSection({ configuration: config.tsdocConfiguration }, [
                        new DocParagraph({ configuration: config.tsdocConfiguration }, [
                            new DocEmphasisSpan(
                                {
                                    configuration: config.tsdocConfiguration,
                                    bold: true,
                                },
                                [
                                    new DocPlainText({
                                        configuration: config.tsdocConfiguration,
                                        text: "Return type: ",
                                    }),
                                ],
                            ),
                            ...renderedTypeExcerpt,
                        ]),
                    ]),
                );
            }
        }
    }

    return docSections.length === 0
        ? undefined
        : new DocSection({ configuration: config.tsdocConfiguration }, [
              renderHeading(
                  {
                      title: "Returns",
                      id: `${getQualifiedApiItemName(apiItem)}-returns`,
                  },
                  config,
              ),
              mergeSections(docSections, config.tsdocConfiguration),
          ]);
}

/**
 * Represents a series API child items for which documentation sections will be generated.
 */
export interface ChildSectionProperties {
    /**
     * Heading title for the section being rendered.
     */
    headingTitle: string;

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
 * @param childSections - The child sections to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param renderChild - Callback to render a given child item.
 *
 * @returns The doc section if there were any child contents to render, otherwise `undefined`.
 */
export function renderChildDetailsSection(
    childSections: readonly ChildSectionProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem) => DocSection,
): DocSection | undefined {
    const childNodes: DocSection[] = [];

    for (const childSection of childSections) {
        // Only render contents for a section if the item kind is one that gets rendered to its parent's document
        // (i.e. it does not get rendered to its own document).
        // Also only render the section if it actually has contents to render (to avoid empty headings).
        if (
            !doesItemKindRequireOwnDocument(childSection.itemKind, config.documentBoundaries) &&
            childSection.items.length !== 0
        ) {
            const renderedChildSection = renderChildrenUnderHeading(
                childSection.items,
                childSection.headingTitle,
                config,
                renderChild,
            );
            if (renderedChildSection !== undefined) {
                childNodes.push(renderedChildSection);
            }
        }
    }

    return childNodes.length === 0
        ? undefined
        : mergeSections(childNodes, config.tsdocConfiguration);
}

/**
 * Renders a section containing a list of sub-sections for the provided list of child API items.
 *
 * @remarks Displayed as a heading with the provided title, followed by a series a sub-sections for each child item.
 *
 * @param childItems - The child API items to be displayed as sub-contents.
 * @param headingTitle - The title of the section-root heading.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 * @param renderChild - Callback for rendering each child item as a sub-section.
 *
 * @returns The doc section if there were any child items provided, otherwise `undefined`.
 */
export function renderChildrenUnderHeading(
    childItems: readonly ApiItem[],
    headingTitle: string,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (childItem: ApiItem) => DocSection,
): DocSection | undefined {
    if (childItems.length === 0) {
        return undefined;
    }

    const childSections: DocSection[] = childItems.map((childItem) => renderChild(childItem));

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading(
            {
                title: headingTitle,
            },
            config,
        ),
        mergeSections(childSections, config.tsdocConfiguration),
    ]);
}

/**
 * Renders a Link tag for the provided link.
 * @param link - The link to render.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderLink(
    link: Link,
    config: Required<MarkdownDocumenterConfiguration>,
): DocLinkTag {
    return new DocLinkTag({
        configuration: config.tsdocConfiguration,
        tagName: "@link",
        linkText: link.text,
        urlDestination: link.url,
    });
}
