/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    ApiCallSignature,
    ApiClass,
    ApiConstructSignature,
    ApiConstructor,
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
} from "@microsoft/api-extractor-model";
import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../Configuration";
import { MarkdownDocument } from "../MarkdownDocument";
import { doesItemRequireOwnDocument, getFilePathForApiItem } from "../utilities";
import { renderBreadcrumb, renderHeadingForApiItem } from "./helpers";

/**
 * Generates a {@link MarkdownDocument} for the specified `apiModel`.
 *
 * @param apiModel - The API model content to be rendered. Represents the root of the API suite.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function renderModelDocument(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
): MarkdownDocument {
    const logger = config.logger;

    logger.verbose(`Rendering API Model document...`);

    const docNodes: DocNode[] = [];

    // Render heading
    if (config.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeadingForApiItem(apiModel, config));
    }

    // Do not render breadcrumb for Model document

    // Render body contents
    docNodes.push(config.renderModelSection(apiModel, config));

    logger.verbose(`API Model document rendered successfully.`);

    return createMarkdownDocument(
        apiModel,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
    );
}

/**
 * Generates a {@link MarkdownDocument} for the specified `apiPackage`.
 *
 * @param apiPackage - The package content to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function renderPackageDocument(
    apiPackage: ApiPackage,
    config: Required<MarkdownDocumenterConfiguration>,
): MarkdownDocument {
    const logger = config.logger;

    logger.verbose(`Rendering ${apiPackage.name} package document...`);

    const docNodes: DocNode[] = [];

    // Render heading
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

    logger.verbose(`Package document rendered successfully.`);

    return createMarkdownDocument(
        apiPackage,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
    );
}

/**
 * Generates a {@link MarkdownDocument} for the specified `apiItem`.
 *
 * @remarks This should only be called for API item kinds that are intended to be rendered to their own document
 * (as opposed to being rendered to the same document as their parent) per the provided `config`
 * (see {@link PolicyOptions.documentBoundaries}).
 *
 * Also note that this should not be called for the following item kinds, which must be handled specially:
 *
 * - `Model`: Use {@link renderModelDocument}
 * - `Package`: Use {@link renderPackageDocument}
 * - `EntryPoint`: No content is currently rendered for this type of content.
 *
 * @param apiItem - The API item to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function renderApiItemDocument(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): MarkdownDocument {
    if (apiItem.kind === ApiItemKind.None) {
        throw new Error(`Encountered API item with a kind of "None".`);
    }

    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
        throw new Error(
            `"renderApiDocument" called for an API item kind that is not intended to be rendered to its own document. Provided item kind: "${apiItem.kind}".`,
        );
    }

    const logger = config.logger;

    logger.verbose(`Rendering document for ${apiItem.displayName} (${apiItem.kind})...`);

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

    logger.verbose(`Document for ${apiItem.displayName} rendered successfully.`);

    return createMarkdownDocument(
        apiItem,
        new DocSection({ configuration: config.tsdocConfiguration }, docNodes),
        config,
    );
}

/**
 * Helper for generating a {@link MarkdownDocument} from an API item and its rendered doc contents.
 */
function createMarkdownDocument(
    apiItem: ApiItem,
    contents: DocSection,
    config: Required<MarkdownDocumenterConfiguration>,
): MarkdownDocument {
    return {
        contents,
        apiItem,
        path: getFilePathForApiItem(apiItem, config, /* includeExtension: */ true),
    };
}

/**
 * Renders a section for the specified `apiItem`.
 *
 * @remarks Must not be called for the following API item kinds, which must be handled specially:
 *
 * - `Model`
 * - `Package`
 * - `EntryPoint`
 */
function renderApiSection(
    apiItem: ApiItem,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    if (apiItem.kind === ApiItemKind.None) {
        throw new Error(`Encountered API item with a kind of "None".`);
    }

    if (
        apiItem.kind === ApiItemKind.Model ||
        apiItem.kind === ApiItemKind.Package ||
        apiItem.kind === ApiItemKind.EntryPoint
    ) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    const logger = config.logger;

    logger.verbose(`Rendering section for ${apiItem.displayName}...`);

    let renderedSection: DocSection;
    switch (apiItem.kind) {
        case ApiItemKind.CallSignature:
            renderedSection = config.renderCallSignatureSection(
                apiItem as ApiCallSignature,
                config,
            );
            break;

        case ApiItemKind.Class:
            renderedSection = config.renderClassSection(apiItem as ApiClass, config, (childItem) =>
                renderApiSection(childItem, config),
            );
            break;

        case ApiItemKind.ConstructSignature:
            renderedSection = config.renderConstructorSection(
                apiItem as ApiConstructSignature,
                config,
            );
            break;

        case ApiItemKind.Constructor:
            renderedSection = config.renderConstructorSection(apiItem as ApiConstructor, config);
            break;

        case ApiItemKind.Enum:
            renderedSection = config.renderEnumSection(apiItem as ApiEnum, config, (childItem) =>
                renderApiSection(childItem, config),
            );
            break;

        case ApiItemKind.EnumMember:
            renderedSection = config.renderEnumMemberSection(apiItem as ApiEnumMember, config);
            break;

        case ApiItemKind.Function:
            renderedSection = config.renderFunctionSection(apiItem as ApiFunction, config);
            break;

        case ApiItemKind.IndexSignature:
            renderedSection = config.renderIndexSignatureSection(
                apiItem as ApiIndexSignature,
                config,
            );
            break;

        case ApiItemKind.Interface:
            renderedSection = config.renderInterfaceSection(
                apiItem as ApiInterface,
                config,
                (childItem) => renderApiSection(childItem, config),
            );
            break;

        case ApiItemKind.Method:
            renderedSection = config.renderMethodSection(apiItem as ApiMethod, config);
            break;

        case ApiItemKind.MethodSignature:
            renderedSection = config.renderMethodSection(apiItem as ApiMethodSignature, config);
            break;

        case ApiItemKind.Namespace:
            renderedSection = config.renderNamespaceSection(
                apiItem as ApiNamespace,
                config,
                (childItem) => renderApiSection(childItem, config),
            );
            break;

        case ApiItemKind.Property:
        case ApiItemKind.PropertySignature:
            renderedSection = config.renderPropertySection(apiItem as ApiPropertyItem, config);
            break;

        case ApiItemKind.TypeAlias:
            renderedSection = config.renderTypeAliasSection(apiItem as ApiTypeAlias, config);
            break;

        case ApiItemKind.Variable:
            renderedSection = config.renderVariableSection(apiItem as ApiVariable, config);
            break;

        default:
            throw new Error(`Unrecognized API item kind: "${apiItem.kind}".`);
    }

    logger.verbose(`${apiItem.displayName} section rendered successfully!`);
    return renderedSection;
}
