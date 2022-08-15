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
    Excerpt,
    ExcerptTokenKind,
    HeritageType,
    IResolveDeclarationReferenceResult,
    TypeParameter,
} from "@microsoft/api-extractor-model";
import {
    DocBlock,
    DocFencedCode,
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    StandardTags,
} from "@microsoft/tsdoc";
import {
    heading as buildHeading,
    code,
    link,
    list,
    listItem,
    paragraph,
    strong,
    table,
    tableRow,
    text,
} from "mdast-builder";
import { Node as AstNode, Parent as AstParentNode } from "unist";

import { Heading } from "../../Heading";
import { Link, urlFromLink } from "../../Link";
import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocNoteBox } from "../../doc-nodes";
import { SectionAstNode, buildSection, docNodeToMdAst } from "../../markdown-ast";
import {
    ApiFunctionLike,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getHeadingForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
    mergeSections,
} from "../../utilities";
import { renderParametersTable } from "./TablesRenderingHelpers";

export function renderSignature(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): AstNode | undefined {
    if (apiItem instanceof ApiDeclaredItem) {
        const docNodes: AstNode[] = [];
        docNodes.push(
            renderHeading({
                title: "Signature",
                id: `${getQualifiedApiItemName(apiItem)}-signature`,
            }),
        );
        if (apiItem.excerpt.text.length > 0) {
            docNodes.push(code("typescript", apiItem.getExcerptWithModifiers()));
        }

        const renderedHeritageTypes = renderHeritageTypes(apiItem, config);
        if (renderedHeritageTypes !== undefined) {
            docNodes.push(renderedHeritageTypes);
        }

        return buildSection(docNodes);
    }
    return undefined;
}

export function renderHeritageTypes(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): SectionAstNode | undefined {
    const docNodes: AstNode[] = [];

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
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters);
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
        const renderedTypeParameters = renderTypeParameters(apiItem.typeParameters);
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    return buildSection(docNodes);
}

function renderHeritageTypeList(
    heritageTypes: readonly HeritageType[],
    label: string,
    config: Required<MarkdownDocumenterConfiguration>,
): AstNode | undefined {
    if (heritageTypes.length > 0) {
        const docNodes: AstNode[] = [];

        docNodes.push(strong([text(`${label}: `)]));

        let needsComma: boolean = false;
        for (const heritageType of heritageTypes) {
            if (needsComma) {
                docNodes.push(text(", "));
            }

            docNodes.push(renderExcerptWithHyperlinks(heritageType.excerpt, config));
            needsComma = true;
        }

        return paragraph(docNodes);
    }
    return undefined;
}

export function renderTypeParameters(
    typeParameters: readonly TypeParameter[],
): SectionAstNode | undefined {
    if (typeParameters.length > 0) {
        const docNodes: AstNode[] = [];

        docNodes.push(strong([text("Type parameters: ")]));

        const listItemNodes: AstNode[] = [];
        for (const typeParameter of typeParameters) {
            listItemNodes.push(strong([text(typeParameter.name)]));

            if (typeParameter.tsdocTypeParamBlock !== undefined) {
                listItemNodes.push(text(": "));
                listItemNodes.push(docNodeToMdAst(typeParameter.tsdocTypeParamBlock.content));
            }

            docNodes.push(listItem(listItemNodes));
        }
        docNodes.push(list("unordered", listItemNodes));

        return buildSection(docNodes);
    }
    return undefined;
}

export function renderExcerptWithHyperlinks(
    excerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): AstNode {
    const docNodes: AstNode[] = [];
    for (const token of excerpt.spannedTokens) {
        // TODO: is this needed?
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
                    link(
                        getLinkUrlForApiItem(apiItemResult.resolvedApiItem, config),
                        unwrappedTokenText /* TODO: kids? */,
                    ),
                );
                wroteHyperlink = true;
            }
        }

        // If the token was not one from which we generated hyperlink text, write as plain text instead
        if (!wroteHyperlink) {
            docNodes.push(text(unwrappedTokenText));
        }
    }
    return paragraph(docNodes);
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // TODO: old system generated link text "Packages" for Model page

    const docNodes: DocNode[] = [];

    // Get ordered ancestry of document items
    const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
        doesItemRequireOwnDocument(hierarchyItem, config.documentBoundaries),
    ).reverse(); // Reverse from ascending to descending order

    function createLinkTag(link: Link): DocLinkTag {
        const linkUrl = urlFromLink(link);
        return new DocLinkTag({
            configuration: config.tsdocConfiguration,
            tagName: "@link",
            linkText: link.text,
            urlDestination: linkUrl,
        });
    }

    let writtenAnythingYet = false;
    for (const hierarchyItem of ancestry) {
        if (writtenAnythingYet) {
            docNodes.push(
                new DocPlainText({
                    configuration: config.tsdocConfiguration,
                    text: " > ",
                }),
            );
        }

        const link = getLinkForApiItem(hierarchyItem, config);
        docNodes.push(createLinkTag(link));

        writtenAnythingYet = true;
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes),
    ]);
}

export function renderHeadingForApiItem(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): HeadingAstNode {
    return renderHeading(getHeadingForApiItem(apiItem, config), config);
}

export function renderHeading(heading: Heading): HeadingAstNode {
    const rawHeadingNode = buildHeading(heading.level ?? 0, [text(heading.title)]);
    return {
        ...rawHeadingNode,
        data: {
            id: heading.id,
        },
    };
}

export function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocNoteBox {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocNoteBox({ configuration: config.tsdocConfiguration }, [
        new DocParagraph({ configuration: config.tsdocConfiguration }, [
            new DocPlainText({ configuration: config.tsdocConfiguration, text: betaWarning }),
        ]),
    ]);
}

export function renderSummary(apiItem: ApiItem): DocSection | undefined {
    return apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined
        ? apiItem.tsdocComment.summarySection
        : undefined;
}

export function renderRemarks(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.remarksBlock !== undefined) {
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            renderHeading(
                { title: "Remarks", id: `${getQualifiedApiItemName(apiItem)}-remarks` },
                config,
            ),
            apiItem.tsdocComment.remarksBlock.content,
        ]);
    }
    return undefined;
}

export function renderDeprecationNotice(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (
        apiItem instanceof ApiDocumentedItem &&
        apiItem.tsdocComment?.deprecatedBlock !== undefined
    ) {
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            new DocNoteBox(
                {
                    configuration: config.tsdocConfiguration,
                },
                [...apiItem.tsdocComment.deprecatedBlock.content.nodes],
            ),
        ]);
    }
    return undefined;
}

export function renderExamples(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.customBlocks !== undefined) {
        const exampleBlocks: DocBlock[] = apiItem.tsdocComment.customBlocks.filter(
            (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase,
        );

        if (exampleBlocks.length === 0) {
            return undefined;
        }

        // If there is only 1 example, render it with the default (un-numbered) heading
        if (exampleBlocks.length === 1) {
            return renderExample({ content: exampleBlocks[0].content }, config);
        }

        const exampleSections: DocSection[] = [];
        for (let i = 0; i < exampleBlocks.length; i++) {
            exampleSections.push(
                renderExample({ content: exampleBlocks[i].content, exampleNumber: i + 1 }, config),
            );
        }

        // Merge example sections into a single section to simplify hierarchy
        const mergedSection = mergeSections(exampleSections, config.tsdocConfiguration);

        return new DocSection({ configuration: config.tsdocConfiguration }, [
            renderHeading(
                { title: "Examples", id: `${getQualifiedApiItemName(apiItem)}-examples` },
                config,
            ),
            mergedSection,
        ]);
    }
    return undefined;
}

export interface DocExample {
    /**
     * `@example` comment body.
     */
    content: DocSection;

    /**
     * Example number. Used to disambiguate multiple `@example` comments numerically.
     * If not specified, example heading will not be labeled with a number.
     */
    exampleNumber?: number;
}

export function renderExample(
    example: DocExample,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const headingTitle: string =
        example.exampleNumber === undefined ? "Example" : `Example ${example.exampleNumber}`;

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading({ title: headingTitle }, config),
        example.content,
    ]);
}

function renderParametersAstTable(
    apiParameters: readonly Parameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): AstNode {
    const headerTitles = ["Parameter", "Type", "Description"];
    // TODO: denote optional parameters?

    const tableRows: AstNode[] = apiParameters.map(
        (apiParameter) =>
            new DocTableRow({ configuration: config.tsdocConfiguration }, [
                renderParameterTitleCell(apiParameter, config),
                renderParameterTypeCell(apiParameter, config),
                renderParameterSummaryCell(apiParameter, config),
            ]),
    );

    return new table(
        {
            configuration: config.tsdocConfiguration,
            headerTitles,
        },
        tableRows,
    );
}

export function renderParametersSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): SectionAstNode | undefined {
    if (apiFunctionLike.parameters.length === 0) {
        return undefined;
    }

    return {
        // TODO: data and position?
        children: [
            renderHeading({
                title: "Parameters",
                id: `${getQualifiedApiItemName(apiFunctionLike)}-parameters`,
            }),
            renderParametersAstTable(apiFunctionLike.parameters, config),
        ],
        type: "section",
    };
}

export function renderChildrenUnderHeading(
    childItems: readonly ApiItem[],
    headingTitle: string,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (childItem: ApiItem) => SectionAstNode,
): SectionAstNode | undefined {
    if (childItems.length === 0) {
        return undefined;
    }

    const childSections: SectionAstNode[] = childItems.map((childItem) => renderChild(childItem));

    return {
        // TODO: data and position?
        children: [
            renderHeading({
                title: headingTitle,
            }),
            mergeAstSections(childSections, config.tsdocConfiguration),
        ],
        type: "section",
    };
}

export interface ChildSectionProperties {
    headingTitle: string;
    itemKind: ApiItemKind;
    items: readonly ApiItem[];
}

export function renderChildDetailsSection(
    childSections: readonly ChildSectionProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem) => SectionAstNode,
): SectionAstNode | undefined {
    const childNodes: SectionAstNode[] = [];

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
        : mergeAstSections(childNodes, config.tsdocConfiguration);
}
