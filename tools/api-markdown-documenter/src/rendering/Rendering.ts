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

import { MarkdownDocument } from "../MarkdownDocument";
import { MarkdownDocumenterConfiguration } from "../MarkdownDocumenterConfiguration";
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
    if (config.verbose) {
        console.log(`Rendering API Model document...`);
    }

    const docNodes: DocNode[] = [];

    // Render heading
    if (config.includeTopLevelDocumentHeading) {
        docNodes.push(renderHeadingForApiItem(apiModel, config));
    }

    // Do not render breadcrumb for Model document

    // Render body contents
    docNodes.push(config.renderModelSection(apiModel, config));

    if (config.verbose) {
        console.log(`API Model document rendered successfully.`);
    }

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
    if (config.verbose) {
        console.log(`Rendering ${apiPackage.name} package document...`);
    }

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

    if (config.verbose) {
        console.log(`Package document rendered successfully.`);
    }

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
        throw new Error(`Encountered API item with a kind of "${apiItem.kind}".`);
    }

    if ([ApiItemKind.Model, ApiItemKind.Package, ApiItemKind.EntryPoint].includes(apiItem.kind)) {
        throw new Error(`Provided API item kind must be handled specially: "${apiItem.kind}".`);
    }

    if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
        throw new Error(
            `"renderApiDocument" called for an API item kind that is not intended to be rendered to its own document. Provided item kind: "${apiItem.kind}".`,
        );
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
        throw new Error(`Encountered API item with a kind of "${apiItem.kind}".`);
    }

    if ([ApiItemKind.Model, ApiItemKind.Package, ApiItemKind.EntryPoint].includes(apiItem.kind)) {
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
