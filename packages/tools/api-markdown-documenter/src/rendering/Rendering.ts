import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiEnum,
    ApiEnumMember,
    ApiFunction,
    ApiIndexSignature,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiNamespace,
    ApiPackage,
    ApiPropertyItem,
    ApiTypeAlias,
    ApiVariable,
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
    StringBuilder,
} from "@microsoft/tsdoc";

import { Heading } from "../Heading";
import { Link, urlFromLink } from "../Link";
import { MarkdownDocument } from "../MarkdownDocument";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { MarkdownEmitter } from "../MarkdownEmitter";
import { DocEmphasisSpan, DocHeading, DocNoteBox } from "../doc-nodes";
import {
    ApiFunctionLike,
    doesItemKindRequireOwnDocument,
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getFilePathForApiItem,
    getHeadingForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
} from "../utilities";
import { renderParametersTable } from "./Tables";

// TODOs:
// - heading level tracking
// - Model heading text from config

/**
 * TODO
 * Note: no breadcrumb
 * @param apiModel - TODO
 * @param config - TODO
 * @param tsdocConfiguration - TODO
 */
export function renderModelPage(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (config.verbose) {
        console.log(`Rendering API Model page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (config.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeadingForApiItem(apiModel, config));
    }

    // Do not render breadcrumb for Model page

    // Render body contents
    docNodes.push(config.renderModelSection(apiModel, config));

    if (config.verbose) {
        console.log(`API Model page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiModel,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
        markdownEmitter,
    );
}

export function renderPackagePage(
    apiPackage: ApiPackage,
    config: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (config.verbose) {
        console.log(`Rendering ${apiPackage.name} package page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (config.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeadingForApiItem(apiPackage, config));
    }

    // Render breadcrumb
    docNodes.push(renderBreadcrumb(apiPackage, config));

    // Render body contents
    docNodes.push(
        config.renderPackageSection(apiPackage, config, (childItem) =>
            renderApiSection(childItem, config),
        ),
    );

    if (config.verbose) {
        console.log(`Package page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiPackage,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
        markdownEmitter,
    );
}

export function renderApiPage(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    if (config.verbose) {
        console.log(`Rendering document for ${apiItem.displayName}...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    if (config.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeadingForApiItem(apiItem, config));
    }

    // Render breadcrumb
    if (config.includeBreadcrumb) {
        docNodes.push(renderBreadcrumb(apiItem, config));
    }

    // Render body content for the item
    docNodes.push(renderApiSection(apiItem, config));

    if (config.verbose) {
        console.log(`Document for ${apiItem.displayName} rendered successfully.`);
    }

    return createMarkdownDocument(
        apiItem,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
        markdownEmitter,
    );
}

function createMarkdownDocument(
    apiItem: ApiItem,
    renderedContents: DocSection,
    config: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    const emittedContents = markdownEmitter.emit(new StringBuilder(), renderedContents, {
        contextApiItem: apiItem,
        getFileNameForApiItem: (_apiItem) => getFilePathForApiItem(_apiItem, config, true),
    });
    return {
        contents: emittedContents,
        apiItemName: getQualifiedApiItemName(apiItem),
        path: getFilePathForApiItem(apiItem, config, /* includeExtension: */ true),
    };
}

function renderApiSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint ||
        apiItem.kind === ApiItemKind.None
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    switch (apiItem.kind) {
        case ApiItemKind.CallSignature:
            return config.renderCallSignatureSection(apiItem as ApiCallSignature, config);

        case ApiItemKind.Class:
            return config.renderClassSection(apiItem as ApiClass, config, (childItem) =>
                renderApiSection(childItem, config),
            );

        case ApiItemKind.ConstructSignature:
            return config.renderConstructorSection(apiItem as ApiConstructSignature, config);

        case ApiItemKind.Constructor:
            return config.renderConstructorSection(apiItem as ApiConstructor, config);

        case ApiItemKind.Enum:
            return config.renderEnumSection(apiItem as ApiEnum, config, (childItem) =>
                renderApiSection(childItem, config),
            );

        case ApiItemKind.EnumMember:
            return config.renderEnumMemberSection(apiItem as ApiEnumMember, config);

        case ApiItemKind.Function:
            return config.renderFunctionSection(apiItem as ApiFunction, config);

        case ApiItemKind.IndexSignature:
            return config.renderIndexSignatureSection(apiItem as ApiIndexSignature, config);

        case ApiItemKind.Interface:
            return config.renderInterfaceSection(apiItem as ApiInterface, config, (childItem) =>
                renderApiSection(childItem, config),
            );

        case ApiItemKind.Method:
            return config.renderMethodSection(apiItem as ApiMethod, config);

        case ApiItemKind.MethodSignature:
            return config.renderMethodSection(apiItem as ApiMethodSignature, config);

        case ApiItemKind.Namespace:
            return config.renderNamespaceSection(apiItem as ApiNamespace, config, (childItem) =>
                renderApiSection(childItem, config),
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return config.renderPropertySection(apiItem as ApiPropertyItem, config);

        case ApiItemKind.TypeAlias:
            return config.renderTypeAliasSection(apiItem as ApiTypeAlias, config);

        case ApiItemKind.Variable:
            return config.renderVariableSection(apiItem as ApiVariable, config);

        default:
            throw new Error(`Unrecognized API item kind: "${apiItem.kind}".`);
    }
}

export function renderSignature(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiItem instanceof ApiDeclaredItem) {
        const docNodes: DocNode[] = [];
        docNodes.push(renderHeading({ title: "Signature" }, config));
        if (apiItem.excerpt.text.length > 0) {
            docNodes.push(
                new DocFencedCode({
                    configuration: config.tsdocConfiguration,
                    code: apiItem.getExcerptWithModifiers(),
                    language: "typescript",
                }),
            );
        }

        const renderedHeritageTypes = renderHeritageTypes(apiItem, config);
        if (renderedHeritageTypes !== undefined) {
            docNodes.push(renderedHeritageTypes);
        }

        return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
    }
    return undefined;
}

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

function renderHeritageTypeList(
    heritageTypes: readonly HeritageType[],
    label: string,
    config: Required<MarkdownDocumenterConfiguration>,
): DocParagraph | undefined {
    if (heritageTypes.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                new DocPlainText({ configuration: config.tsdocConfiguration, text: `${label}: ` }),
            ]),
        );

        let needsComma: boolean = false;
        for (const heritageType of heritageTypes) {
            if (needsComma) {
                docNodes.push(
                    new DocPlainText({ configuration: config.tsdocConfiguration, text: ", " }),
                );
            }

            docNodes.push(renderExcerptWithHyperlinks(heritageType.excerpt, config));
            needsComma = true;
        }

        return new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderTypeParameters(
    typeParameters: readonly TypeParameter[],
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (typeParameters.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: "Type parameters: ",
                    }),
                ]),
            ]),
        );

        // TODO: DocList type?
        for (const typeParameter of typeParameters) {
            const paragraphNodes: DocNode[] = [];

            paragraphNodes.push(
                new DocPlainText({ configuration: config.tsdocConfiguration, text: "* " }),
            ); // List bullet
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
                    new DocPlainText({ configuration: config.tsdocConfiguration, text: ": " }),
                );
                paragraphNodes.push(...typeParameter.tsdocTypeParamBlock.content.nodes);
            }

            docNodes.push(
                new DocParagraph({ configuration: config.tsdocConfiguration }, paragraphNodes),
            );
        }

        return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderExcerptWithHyperlinks(
    excerpt: Excerpt,
    config: Required<MarkdownDocumenterConfiguration>,
): DocParagraph {
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
                    new DocLinkTag({
                        configuration: config.tsdocConfiguration,
                        tagName: "@link",
                        linkText: unwrappedTokenText,
                        urlDestination: getLinkUrlForApiItem(apiItemResult.resolvedApiItem, config),
                    }),
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
    return new DocParagraph({ configuration: config.tsdocConfiguration }, docNodes);
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
): DocHeading {
    return renderHeading(getHeadingForApiItem(apiItem, config), config);
}

export function renderHeading(
    heading: Heading,
    config: Required<MarkdownDocumenterConfiguration>,
): DocHeading {
    return new DocHeading({
        ...heading,
        configuration: config.tsdocConfiguration,
    });
}

export function renderBetaWarning(config: Required<MarkdownDocumenterConfiguration>): DocSection {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        new DocNoteBox({ configuration: config.tsdocConfiguration }, [
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocPlainText({ configuration: config.tsdocConfiguration, text: betaWarning }),
            ]),
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
            // TODO: heading level
            renderHeading({ title: "Remarks" }, config),
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
                    // TODO
                    // type: 'warning',
                    // title: 'Deprecated'
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
            return new DocSection({ configuration: config.tsdocConfiguration }, [
                renderExample({ content: exampleBlocks[0] }, config),
            ]);
        }

        const renderedExamples: DocSection[] = [];
        for (let i = 0; i < exampleBlocks.length; i++) {
            renderedExamples.push(
                renderExample({ content: exampleBlocks[i], exampleNumber: i + 1 }, config),
            );
        }

        return new DocSection({ configuration: config.tsdocConfiguration }, renderedExamples);
    }
    return undefined;
}

export interface DocExample {
    /**
     * `@example` comment body.
     */
    content: DocBlock;

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

export function renderParametersSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection | undefined {
    if (apiFunctionLike.parameters.length === 0) {
        return undefined;
    }

    // TODO: caption text?

    return new DocSection({ configuration: config.tsdocConfiguration }, [
        renderHeading({ title: "Parameters" }, config),
        renderParametersTable(apiFunctionLike.parameters, config),
    ]);
}

export function renderChildrenUnderHeading(
    childItems: readonly ApiItem[],
    headingTitle: string,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (childItem: ApiItem) => DocSection,
): DocSection | undefined {
    return childItems.length === 0
        ? undefined
        : new DocSection({ configuration: config.tsdocConfiguration }, [
              renderHeading(
                  {
                      title: headingTitle,
                  },
                  config,
              ),
              new DocSection(
                  { configuration: config.tsdocConfiguration },
                  childItems.map((constructor) => renderChild(constructor)),
              ),
          ]);
}

/**
 * TODO
 *
 * Input props for {@link renderChildDetailsSection}
 */
export interface ChildSectionProperties {
    headingTitle: string;
    itemKind: ApiItemKind;
    items: readonly ApiItem[];
}

export function renderChildDetailsSection(
    childSections: readonly ChildSectionProperties[],
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem) => DocSection,
): DocSection | undefined {
    const docNodes: DocNode[] = [];

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
                docNodes.push(renderedChildSection);
            }
        }
    }

    return docNodes.length === 0
        ? undefined
        : new DocSection({ configuration: config.tsdocConfiguration }, [
              renderHeading({ title: "Details" }, config),
              new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
          ]);
}
