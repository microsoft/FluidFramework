/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiClass,
	type ApiConstructSignature,
	type ApiConstructor,
	type ApiEnum,
	type ApiEnumMember,
	type ApiFunction,
	type ApiIndexSignature,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiMethodSignature,
	type ApiNamespace,
	type ApiPropertyItem,
	type ApiTypeAlias,
	type ApiVariable,
} from "@microsoft/api-extractor-model";

import type { DocumentNode, SectionNode } from "../documentation-domain/index.js";
import { getApiItemKind } from "../utilities/index.js";

import { doesItemRequireOwnDocument, shouldItemBeIncluded } from "./ApiItemTransformUtilities.js";
import { createDocument } from "./Utilities.js";
import type { ApiItemTransformationConfiguration } from "./configuration/index.js";
import { createBreadcrumbParagraph, wrapInSection } from "./helpers/index.js";

/**
 * Creates a {@link DocumentNode} for the specified `apiItem`.
 *
 * @remarks
 *
 * This should only be called for API item kinds that are intended to be rendered to their own document
 * (as opposed to being rendered to the same document as their parent) per the provided `config`
 * (see {@link DocumentationSuiteOptions.documentBoundaries}).
 *
 * Also note that this should not be called for the following item kinds, which must be handled specially:
 *
 * - `Model`: Use {@link renderModelDocument}
 * - `Package`: Use {@link renderPackageDocument}
 * - `EntryPoint`: No content is currently rendered for this type of content.
 *
 * @param apiItem - The API item to be rendered.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function apiItemToDocument(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): DocumentNode {
	const itemKind = getApiItemKind(apiItem);

	if (
		itemKind === ApiItemKind.Model ||
		itemKind === ApiItemKind.Package ||
		itemKind === ApiItemKind.EntryPoint
	) {
		throw new Error(`Provided API item kind must be handled specially: "${itemKind}".`);
	}

	if (!shouldItemBeIncluded(apiItem, config)) {
		throw new Error(
			`Provided API item "${apiItem.displayName}" should not be included in documentation suite per configuration. Cannot generate a document for it.`,
		);
	}

	if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
		throw new Error(
			`"renderApiDocument" called for an API item kind that is not intended to be rendered to its own document. Provided item kind: "${itemKind}".`,
		);
	}

	const logger = config.logger;

	logger.verbose(`Generating document for ${apiItem.displayName} (${itemKind})...`);

	const sections: SectionNode[] = [];

	// Render breadcrumb
	if (config.includeBreadcrumb) {
		sections.push(wrapInSection([createBreadcrumbParagraph(apiItem, config)]));
	}

	// Render body content for the item
	sections.push(...apiItemToSections(apiItem, config));

	logger.verbose(`Document for ${apiItem.displayName} rendered successfully.`);

	return createDocument(apiItem, sections, config);
}

/**
 * Creates a section for the specified `apiItem`.
 *
 * @remarks
 *
 * Must not be called for the following API item kinds, which must be handled specially:
 *
 * - `Model`
 * - `Package`
 * - `EntryPoint`
 */
export function apiItemToSections(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): SectionNode[] {
	const itemKind = getApiItemKind(apiItem);

	if (
		itemKind === ApiItemKind.Model ||
		itemKind === ApiItemKind.Package ||
		itemKind === ApiItemKind.EntryPoint
	) {
		throw new Error(`Provided API item kind must be handled specially: "${itemKind}".`);
	}

	if (!shouldItemBeIncluded(apiItem, config)) {
		// If a parent item has requested we render contents for an item not desired by the configuration,
		// return an empty set of sections.
		return [];
	}

	const logger = config.logger;

	logger.verbose(`Rendering section for ${apiItem.displayName}...`);

	let sections: SectionNode[];
	switch (itemKind) {
		case ApiItemKind.CallSignature: {
			sections = config.transformApiCallSignature(apiItem as ApiCallSignature, config);
			break;
		}

		case ApiItemKind.Class: {
			sections = config.transformApiClass(apiItem as ApiClass, config, (childItem) =>
				apiItemToSections(childItem, config),
			);
			break;
		}

		case ApiItemKind.ConstructSignature: {
			sections = config.transformApiConstructor(apiItem as ApiConstructSignature, config);
			break;
		}

		case ApiItemKind.Constructor: {
			sections = config.transformApiConstructor(apiItem as ApiConstructor, config);
			break;
		}

		case ApiItemKind.Enum: {
			sections = config.transformApiEnum(apiItem as ApiEnum, config, (childItem) =>
				apiItemToSections(childItem, config),
			);
			break;
		}

		case ApiItemKind.EnumMember: {
			sections = config.transformApiEnumMember(apiItem as ApiEnumMember, config);
			break;
		}

		case ApiItemKind.Function: {
			sections = config.transformApiFunction(apiItem as ApiFunction, config);
			break;
		}

		case ApiItemKind.IndexSignature: {
			sections = config.transformApiIndexSignature(apiItem as ApiIndexSignature, config);
			break;
		}

		case ApiItemKind.Interface: {
			sections = config.transformApiInterface(apiItem as ApiInterface, config, (childItem) =>
				apiItemToSections(childItem, config),
			);
			break;
		}

		case ApiItemKind.Method: {
			sections = config.transformApiMethod(apiItem as ApiMethod, config);
			break;
		}

		case ApiItemKind.MethodSignature: {
			sections = config.transformApiMethod(apiItem as ApiMethodSignature, config);
			break;
		}

		case ApiItemKind.Namespace: {
			sections = config.transformApiNamespace(apiItem as ApiNamespace, config, (childItem) =>
				apiItemToSections(childItem, config),
			);
			break;
		}

		case ApiItemKind.Property:
		case ApiItemKind.PropertySignature: {
			sections = config.transformApiProperty(apiItem as ApiPropertyItem, config);
			break;
		}

		case ApiItemKind.TypeAlias: {
			sections = config.transformApiTypeAlias(apiItem as ApiTypeAlias, config);
			break;
		}

		case ApiItemKind.Variable: {
			sections = config.transformApiVariable(apiItem as ApiVariable, config);
			break;
		}

		default: {
			throw new Error(`Unrecognized API item kind: "${itemKind}".`);
		}
	}

	logger.verbose(`${apiItem.displayName} section rendered successfully!`);
	return sections;
}
