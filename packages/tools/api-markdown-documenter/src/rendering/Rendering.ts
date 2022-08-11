import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import { Utilities } from "@microsoft/api-documenter/lib/utils/Utilities";
import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiEnum,
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
    ApiReleaseTagMixin,
    ApiStaticMixin,
    ApiTypeAlias,
    ApiVariable,
    Excerpt,
    ExcerptTokenKind,
    HeritageType,
    Parameter,
    ReleaseTag,
    TypeParameter,
} from "@microsoft/api-extractor-model";
import {
    DocBlock,
    DocCodeSpan,
    DocFencedCode,
    DocLinkTag,
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    StandardTags,
    StringBuilder,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { Link, urlFromLink } from "../Link";
import { MarkdownDocument } from "../MarkdownDocument";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocHeading, DocNoteBox, DocTable, DocTableCell } from "../doc-nodes";
import {
    ApiFunctionLike,
    doesItemRequireOwnDocument,
    getAncestralHierarchy,
    getFilePathForApiItem,
    getHeadingIdForApiItem,
    getHeadingTitleForApiItem,
    getLinkForApiItem,
    getLinkUrlForApiItem,
    getQualifiedApiItemName,
} from "../utilities";

// TODOs:
// - heading level tracking
// - Model heading text from config

/**
 * TODO
 * Note: no breadcrumb
 * @param apiModel - TODO
 * @param documenterConfiguration - TODO
 * @param tsdocConfiguration - TODO
 */
export function renderModelPage(
    apiModel: ApiModel,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (documenterConfiguration.verbose) {
        console.log(`Rendering API Model page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiModel, documenterConfiguration, tsdocConfiguration));
    }

    // Do not render breadcrumb for Model page

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderModelSection(
            apiModel,
            documenterConfiguration,
            tsdocConfiguration,
        ),
    );

    if (documenterConfiguration.verbose) {
        console.log(`API Model page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiModel,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

export function renderPackagePage(
    apiPackage: ApiPackage,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (documenterConfiguration.verbose) {
        console.log(`Rendering ${apiPackage.name} package page...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    // TODO: heading level
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiPackage, documenterConfiguration, tsdocConfiguration));
    }

    // Render breadcrumb
    docNodes.push(renderBreadcrumb(apiPackage, documenterConfiguration, tsdocConfiguration));

    // Render body contents
    docNodes.push(
        documenterConfiguration.renderPackageSection(
            apiPackage,
            documenterConfiguration,
            tsdocConfiguration,
        ),
    );

    if (documenterConfiguration.verbose) {
        console.log(`Package page rendered successfully.`);
    }

    return createMarkdownDocument(
        apiPackage,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

export function renderApiPage(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    if (documenterConfiguration.verbose) {
        console.log(`Rendering document for ${apiItem.displayName}...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    if (documenterConfiguration.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeading(apiItem, documenterConfiguration, tsdocConfiguration));
    }

    // Render breadcrumb
    if (documenterConfiguration.includeBreadcrumb) {
        docNodes.push(renderBreadcrumb(apiItem, documenterConfiguration, tsdocConfiguration));
    }

    // Render body content for the item
    docNodes.push(renderApiSection(apiItem, documenterConfiguration, tsdocConfiguration));

    if (documenterConfiguration.verbose) {
        console.log(`Document for ${apiItem.displayName} rendered successfully.`);
    }

    return createMarkdownDocument(
        apiItem,
        new DocSection({ configuration: tsdocConfiguration }, docNodes),
        documenterConfiguration,
        markdownEmitter,
    );
}

function createMarkdownDocument(
    apiItem: ApiItem,
    renderedContents: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    markdownEmitter: MarkdownEmitter,
): MarkdownDocument {
    const emittedContents = markdownEmitter.emit(new StringBuilder(), renderedContents, {
        /* TODO */
    });
    return {
        contents: emittedContents,
        apiItemName: getQualifiedApiItemName(apiItem),
        path: getFilePathForApiItem(apiItem, documenterConfiguration, /* includeExtension: */ true),
    };
}

function renderApiSection(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EnumMember ||
        apiItem.kind === ApiItemKind.EntryPoint ||
        apiItem.kind === ApiItemKind.None
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    switch (apiItem.kind) {
        case ApiItemKind.CallSignature:
            return documenterConfiguration.renderCallSignatureSection(
                apiItem as ApiCallSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Class:
            return documenterConfiguration.renderClassSection(
                apiItem as ApiClass,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.ConstructSignature:
            return documenterConfiguration.renderConstructorSection(
                apiItem as ApiConstructSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Constructor:
            return documenterConfiguration.renderConstructorSection(
                apiItem as ApiConstructor,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Enum:
            return documenterConfiguration.renderEnumSection(
                apiItem as ApiEnum,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Function:
            return documenterConfiguration.renderFunctionSection(
                apiItem as ApiFunction,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.IndexSignature:
            return documenterConfiguration.renderIndexSignatureSection(
                apiItem as ApiIndexSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Interface:
            return documenterConfiguration.renderInterfaceSection(
                apiItem as ApiInterface,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Method:
            return documenterConfiguration.renderMethodSection(
                apiItem as ApiMethod,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.MethodSignature:
            return documenterConfiguration.renderMethodSection(
                apiItem as ApiMethodSignature,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Namespace:
            return documenterConfiguration.renderNamespaceSection(
                apiItem as ApiNamespace,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            return documenterConfiguration.renderPropertySection(
                apiItem as ApiPropertyItem,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.TypeAlias:
            return documenterConfiguration.renderTypeAliasSection(
                apiItem as ApiTypeAlias,
                documenterConfiguration,
                tsdocConfiguration,
            );

        case ApiItemKind.Variable:
            return documenterConfiguration.renderVariableSection(
                apiItem as ApiVariable,
                documenterConfiguration,
                tsdocConfiguration,
            );

        default:
            throw new Error(`Unrecognized API item kind: "${apiItem.kind}".`);
    }
}

export function renderSignature(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    if (apiItem instanceof ApiDeclaredItem) {
        const docNodes: DocNode[] = [];
        docNodes.push(new DocHeading({ configuration: tsdocConfiguration, title: "Signature" }));
        if (apiItem.excerpt.text.length > 0) {
            docNodes.push(
                new DocFencedCode({
                    configuration: tsdocConfiguration,
                    code: apiItem.getExcerptWithModifiers(),
                    language: "typescript",
                }),
            );
        }

        const renderedHeritageTypes = renderHeritageTypes(
            apiItem,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedHeritageTypes !== undefined) {
            docNodes.push(renderedHeritageTypes);
        }

        return new DocSection({ configuration: tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderHeritageTypes(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    const docNodes: DocNode[] = [];

    if (apiItem instanceof ApiClass) {
        // Render `extends` type if there is one.
        if (apiItem.extendsType) {
            const renderedExtendsTypes = renderHeritageTypeList(
                [apiItem.extendsType],
                "Extends",
                documenterConfiguration,
                tsdocConfiguration,
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
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedImplementsTypes !== undefined) {
            docNodes.push(renderedImplementsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(
            apiItem.typeParameters,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    if (apiItem instanceof ApiInterface) {
        // Render `extends` types if there are any.
        const renderedExtendsTypes = renderHeritageTypeList(
            apiItem.extendsTypes,
            "Extends",
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedExtendsTypes !== undefined) {
            docNodes.push(renderedExtendsTypes);
        }

        // Render type parameters if there are any.
        const renderedTypeParameters = renderTypeParameters(
            apiItem.typeParameters,
            documenterConfiguration,
            tsdocConfiguration,
        );
        if (renderedTypeParameters !== undefined) {
            docNodes.push(renderedTypeParameters);
        }
    }

    return new DocSection({ configuration: tsdocConfiguration }, docNodes);
}

function renderHeritageTypeList(
    heritageTypes: readonly HeritageType[],
    label: string,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocParagraph | undefined {
    if (heritageTypes.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocEmphasisSpan({ configuration: tsdocConfiguration, bold: true }, [
                new DocPlainText({ configuration: tsdocConfiguration, text: `${label}: ` }),
            ]),
        );

        let needsComma: boolean = false;
        for (const heritageType of heritageTypes) {
            if (needsComma) {
                docNodes.push(new DocPlainText({ configuration: tsdocConfiguration, text: ", " }));
            }

            docNodes.push(
                renderExcerptWithHyperlinks(
                    heritageType.excerpt,
                    documenterConfiguration,
                    tsdocConfiguration,
                ),
            );
            needsComma = true;
        }

        return new DocParagraph({ configuration: tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderTypeParameters(
    typeParameters: readonly TypeParameter[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    if (typeParameters.length > 0) {
        const docNodes: DocNode[] = [];

        docNodes.push(
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: tsdocConfiguration,
                        text: "Type parameters: ",
                    }),
                ]),
            ]),
        );

        // TODO: DocList type?
        for (const typeParameter of typeParameters) {
            const paragraphNodes: DocNode[] = [];

            paragraphNodes.push(
                new DocPlainText({ configuration: tsdocConfiguration, text: "* " }),
            ); // List bullet
            paragraphNodes.push(
                new DocEmphasisSpan({ configuration: tsdocConfiguration, bold: true }, [
                    new DocPlainText({
                        configuration: tsdocConfiguration,
                        text: typeParameter.name,
                    }),
                ]),
            );

            if (typeParameter.tsdocTypeParamBlock !== undefined) {
                paragraphNodes.push(
                    new DocPlainText({ configuration: tsdocConfiguration, text: ": " }),
                );
                paragraphNodes.push(...typeParameter.tsdocTypeParamBlock.content.nodes);
            }

            docNodes.push(new DocParagraph({ configuration: tsdocConfiguration }, paragraphNodes));
        }

        return new DocSection({ configuration: tsdocConfiguration }, docNodes);
    }
    return undefined;
}

export function renderExcerptWithHyperlinks(
    excerpt: Excerpt,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
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
            // TODO: links

            docNodes.push(
                new DocPlainText({ configuration: tsdocConfiguration, text: unwrappedTokenText }),
            );

            // const apiItemResult: IResolveDeclarationReferenceResult =
            //     this._apiModel.resolveDeclarationReference(token.canonicalReference, undefined);

            // if (apiItemResult.resolvedApiItem) {
            //     docNodes.push(
            //         new DocLinkTag({
            //             configuration: tsdocConfiguration,
            //             tagName: "@link",
            //             linkText: unwrappedTokenText,
            //             urlDestination: getLinkUrlForApiItem(
            //                 apiItemResult.resolvedApiItem,
            //                 documenterConfiguration,
            //             ),
            //         }),
            //     );
            //     wroteHyperlink = true;
            // }
        }

        // If the token was not one from which we generated hyperlink text, write as plain text instead
        if (!wroteHyperlink) {
            docNodes.push(
                new DocPlainText({ configuration: tsdocConfiguration, text: unwrappedTokenText }),
            );
        }
    }
    return new DocParagraph({ configuration: tsdocConfiguration }, docNodes);
}

export function renderBreadcrumb(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    // TODO: old system generated link text "Packages" for Model page

    const docNodes: DocNode[] = [];

    // Get ordered ancestry of document items
    const ancestry = getAncestralHierarchy(apiItem, (hierarchyItem) =>
        doesItemRequireOwnDocument(hierarchyItem, documenterConfiguration.documentBoundaries),
    ).reverse(); // Reverse from ascending to descending order

    function createLinkTag(link: Link): DocLinkTag {
        const linkUrl = urlFromLink(link);
        return new DocLinkTag({
            configuration: tsdocConfiguration,
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
                    configuration: tsdocConfiguration,
                    text: " > ",
                }),
            );
        }

        const link = getLinkForApiItem(hierarchyItem, documenterConfiguration);
        docNodes.push(createLinkTag(link));

        writtenAnythingYet = true;
    }

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, docNodes),
    ]);
}

export function renderHeading(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocHeading {
    // TODO: heading level
    const displayName = getHeadingTitleForApiItem(apiItem, documenterConfiguration);
    return new DocHeading({
        configuration: tsdocConfiguration,
        title: displayName,
        id: getHeadingIdForApiItem(apiItem, documenterConfiguration),
    });
}

export function renderBetaWarning(tsdocConfiguration: TSDocConfiguration): DocSection {
    const betaWarning: string =
        "This API is provided as a preview for developers and may change" +
        " based on feedback that we receive. Do not use this API in a production environment.";

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocNoteBox({ configuration: tsdocConfiguration }, [
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocPlainText({ configuration: tsdocConfiguration, text: betaWarning }),
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
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment?.remarksBlock !== undefined) {
        return new DocSection({ configuration: tsdocConfiguration }, [
            // TODO: heading level
            new DocHeading({ configuration: tsdocConfiguration, title: "Remarks" }),
            apiItem.tsdocComment.remarksBlock.content,
        ]);
    }
    return undefined;
}

export function renderDeprecationNotice(
    apiItem: ApiItem,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    if (
        apiItem instanceof ApiDocumentedItem &&
        apiItem.tsdocComment?.deprecatedBlock !== undefined
    ) {
        return new DocSection({ configuration: tsdocConfiguration }, [
            new DocNoteBox(
                {
                    configuration: tsdocConfiguration,
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
    tsdocConfiguration: TSDocConfiguration,
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
            return new DocSection({ configuration: tsdocConfiguration }, [
                renderExample({ content: exampleBlocks[0] }, tsdocConfiguration),
            ]);
        }

        const renderedExamples: DocSection[] = [];
        for (let i = 0; i < exampleBlocks.length; i++) {
            renderedExamples.push(
                renderExample(
                    { content: exampleBlocks[i], exampleNumber: i + 1 },
                    tsdocConfiguration,
                ),
            );
        }

        return new DocSection({ configuration: tsdocConfiguration }, renderedExamples);
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
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const headingTitle: string =
        example.exampleNumber === undefined ? "Example" : `Example ${example.exampleNumber}`;

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocHeading({ configuration: tsdocConfiguration, title: headingTitle }),
        example.content,
    ]);
}

export function renderApiSummaryCell(
    apiItem: ApiItem,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    const docNodes: DocNode[] = [];

    if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
        if (apiItem.releaseTag === ReleaseTag.Beta) {
            docNodes.push(
                new DocEmphasisSpan(
                    { configuration: tsdocConfiguration, bold: true, italic: true },
                    [new DocPlainText({ configuration: tsdocConfiguration, text: "(BETA)" })],
                ),
            );
            docNodes.push(new DocPlainText({ configuration: tsdocConfiguration, text: " " }));
        }
    }

    if (apiItem instanceof ApiDocumentedItem) {
        if (apiItem.tsdocComment !== undefined) {
            docNodes.push(apiItem.tsdocComment.summarySection);
        }
    }

    return new DocTableCell({ configuration: tsdocConfiguration }, docNodes);
}

export function renderApiTitleCell(
    apiItem: ApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocLinkTag({
                configuration: tsdocConfiguration,
                tagName: "@link",
                linkText: Utilities.getConciseSignature(apiItem),
                urlDestination: getLinkUrlForApiItem(apiItem, documenterConfiguration),
            }),
        ]),
    ]);
}

export function renderModifiersCell(
    apiItem: ApiItem,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    const modifierNodes: DocNode[] = [];
    if (ApiStaticMixin.isBaseClassOf(apiItem)) {
        if (apiItem.isStatic) {
            modifierNodes.push(
                new DocCodeSpan({ configuration: tsdocConfiguration, code: "static" }),
            );
        }
    }

    return new DocTableCell({ configuration: tsdocConfiguration }, modifierNodes);
}

export function renderPropertyTypeCell(
    apiItem: ApiPropertyItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            renderExcerptWithHyperlinks(
                apiItem.propertyTypeExcerpt,
                documenterConfiguration,
                tsdocConfiguration,
            ),
        ]),
    ]);
}

export function renderParameterTitleCell(
    apiParameter: Parameter,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            new DocPlainText({ configuration: tsdocConfiguration, text: apiParameter.name }),
        ]),
    ]);
}

export function renderParameterTypeCell(
    apiParameter: Parameter,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell({ configuration: tsdocConfiguration }, [
        new DocParagraph({ configuration: tsdocConfiguration }, [
            renderExcerptWithHyperlinks(
                apiParameter.parameterTypeExcerpt,
                documenterConfiguration,
                tsdocConfiguration,
            ),
        ]),
    ]);
}

export function renderParameterSummaryCell(
    apiParameter: Parameter,
    tsdocConfiguration: TSDocConfiguration,
): DocTableCell {
    return new DocTableCell(
        { configuration: tsdocConfiguration },
        apiParameter.tsdocParamBlock === undefined ? [] : [apiParameter.tsdocParamBlock],
    );
}

export function renderParametersSection(
    apiFunctionLike: ApiFunctionLike,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection | undefined {
    if (apiFunctionLike.parameters.length === 0) {
        return undefined;
    }

    // TODO: caption text?

    return new DocSection({ configuration: tsdocConfiguration }, [
        new DocHeading({ configuration: tsdocConfiguration, title: "Parameters" }),
        renderParametersTable(
            apiFunctionLike.parameters,
            documenterConfiguration,
            tsdocConfiguration,
        ),
    ]);
}

export function renderParametersTable(
    apiParameters: readonly Parameter[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable {
    const headerTitles = ["Parameter", "Type", "Description"];
    // TODO: denote optional parameters?
    const tableRows: DocTableRow[] = apiParameters.map(
        (apiParameter) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderParameterTitleCell(apiParameter, tsdocConfiguration),
                renderParameterTypeCell(apiParameter, documenterConfiguration, tsdocConfiguration),
                renderParameterSummaryCell(apiParameter, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'param-list',
            // caption: 'List of parameters'
        },
        tableRows,
    );
}

export function renderConstructorsTable(
    apiConstructors: ReadonlyArray<ApiConstructSignature | ApiConstructor>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiConstructors.length === 0) {
        return undefined;
    }

    const headerTitles = ["Constructor", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiConstructors.map(
        (apiConstructor) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiConstructor, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiConstructor, tsdocConfiguration),
                renderApiSummaryCell(apiConstructor, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'param-list',
            // caption: 'List of parameters'
        },
        tableRows,
    );
}

export function renderPropertiesTable(
    apiProperties: readonly ApiPropertyItem[],
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiProperties.length === 0) {
        return undefined;
    }

    const headerTitles = ["Property", "Modifiers", "Type", "Description"];
    const tableRows: DocTableRow[] = apiProperties.map(
        (apiProperty) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiProperty, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiProperty, tsdocConfiguration),
                renderPropertyTypeCell(apiProperty, documenterConfiguration, tsdocConfiguration),
                renderApiSummaryCell(apiProperty, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'property-list',
            // caption: 'List of properties on this class'
        },
        tableRows,
    );
}

export function renderSignaturesTable(
    apiSignatures: ReadonlyArray<ApiCallSignature | ApiIndexSignature>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiSignatures.length === 0) {
        return undefined;
    }

    const headerTitles = ["Signature", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiSignatures.map(
        (apiSignature) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiSignature, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiSignature, tsdocConfiguration),
                renderApiSummaryCell(apiSignature, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'signatures-list',
            // caption: 'List of properties on this class'
        },
        tableRows,
    );
}

export function renderMethodsTable(
    apiMethods: ReadonlyArray<ApiMethod | ApiMethodSignature>,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocTable | undefined {
    if (apiMethods.length === 0) {
        return undefined;
    }

    const headerTitles = ["Method", "Modifiers", "Description"];
    const tableRows: DocTableRow[] = apiMethods.map(
        (apiMethod) =>
            new DocTableRow({ configuration: tsdocConfiguration }, [
                renderApiTitleCell(apiMethod, documenterConfiguration, tsdocConfiguration),
                renderModifiersCell(apiMethod, tsdocConfiguration),
                renderApiSummaryCell(apiMethod, tsdocConfiguration),
            ]),
    );

    return new DocTable(
        {
            configuration: tsdocConfiguration,
            headerTitles,
            // TODO
            // cssClass: 'method-list',
            // caption: 'List of properties on this class'
        },
        tableRows,
    );
}
