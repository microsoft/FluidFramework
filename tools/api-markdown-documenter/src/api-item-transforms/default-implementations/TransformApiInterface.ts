/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiConstructSignature,
	type ApiIndexSignature,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	type ApiMethodSignature,
	type ApiPropertyItem,
} from "@microsoft/api-extractor-model";

import type { SectionNode } from "../../documentation-domain/index.js";
import { getApiItemKind, getScopedMemberNameForDiagnostics } from "../../utilities/index.js";
import { filterChildMembers } from "../ApiItemTransformUtilities.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createChildDetailsSection, createMemberTables } from "../helpers/index.js";

/**
 * Default documentation transform for `Interface` items.
 *
 * @remarks Format:
 *
 * Tables
 *
 * - constructor-signatures
 *
 * - event properties
 *
 * - properties
 *
 * - methods
 *
 * - call-signatures
 *
 * - index-signatures
 *
 * Details (for any types not rendered to their own documents - see {@link DocumentationSuiteOptions.documentBoundaries})
 *
 * - constructor-signatures
 *
 * - event properties
 *
 * - properties
 *
 * - methods
 *
 * - call-signatures
 *
 * - index-signatures
 */
export function transformApiInterface(
	apiInterface: ApiInterface,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const childSections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiInterface, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const constructSignatures: ApiConstructSignature[] = [];
		const allProperties: ApiPropertyItem[] = [];
		const callSignatures: ApiCallSignature[] = [];
		const indexSignatures: ApiIndexSignature[] = [];
		const methods: ApiMethodSignature[] = [];
		for (const child of filteredChildren) {
			const childKind = getApiItemKind(child);
			switch (childKind) {
				case ApiItemKind.ConstructSignature: {
					constructSignatures.push(child as ApiConstructSignature);
					break;
				}
				case ApiItemKind.Property:
				case ApiItemKind.PropertySignature: {
					allProperties.push(child as ApiPropertyItem);
					break;
				}
				case ApiItemKind.CallSignature: {
					callSignatures.push(child as ApiCallSignature);
					break;
				}
				case ApiItemKind.IndexSignature: {
					indexSignatures.push(child as ApiIndexSignature);
					break;
				}
				case ApiItemKind.MethodSignature: {
					methods.push(child as ApiMethodSignature);
					break;
				}
				default: {
					config.logger?.error(
						`Child item "${
							child.displayName
						}" of Interface "${getScopedMemberNameForDiagnostics(
							apiInterface,
						)}" is of unsupported API item kind: "${childKind}"`,
					);
					break;
				}
			}
		}

		// Split properties into event properties and non-event properties
		const standardProperties = allProperties.filter(
			(apiProperty) => !apiProperty.isEventProperty,
		);
		const eventProperties = allProperties.filter((apiProperty) => apiProperty.isEventProperty);

		// Render summary tables
		const renderedMemberTables = createMemberTables(
			[
				{
					headingTitle: "Construct Signatures",
					itemKind: ApiItemKind.ConstructSignature,
					items: constructSignatures,
				},
				{
					headingTitle: "Events",
					itemKind: ApiItemKind.PropertySignature,
					items: eventProperties,
				},
				{
					headingTitle: "Properties",
					itemKind: ApiItemKind.PropertySignature,
					items: standardProperties,
				},
				{
					headingTitle: "Methods",
					itemKind: ApiItemKind.MethodSignature,
					items: methods,
				},
				{
					headingTitle: "Call Signatures",
					itemKind: ApiItemKind.CallSignature,
					items: callSignatures,
				},
				{
					headingTitle: "Index Signatures",
					itemKind: ApiItemKind.IndexSignature,
					items: indexSignatures,
				},
			],
			config,
		);

		if (renderedMemberTables !== undefined) {
			childSections.push(...renderedMemberTables);
		}

		// Render child item details if there are any that will not be rendered to their own documents
		const renderedDetailsSection = createChildDetailsSection(
			[
				{
					heading: { title: "Construct Signature Details" },
					itemKind: ApiItemKind.ConstructSignature,
					items: constructSignatures,
				},
				{
					heading: { title: "Event Details" },
					itemKind: ApiItemKind.PropertySignature,
					items: eventProperties,
				},
				{
					heading: { title: "Property Details" },
					itemKind: ApiItemKind.PropertySignature,
					items: standardProperties,
				},
				{
					heading: { title: "Method Details" },
					itemKind: ApiItemKind.MethodSignature,
					items: methods,
				},
				{
					heading: { title: "Call Signature Details" },
					itemKind: ApiItemKind.CallSignature,
					items: callSignatures,
				},
				{
					heading: { title: "Index Signature Details" },
					itemKind: ApiItemKind.IndexSignature,
					items: indexSignatures,
				},
			],
			config,
			generateChildContent,
		);

		if (renderedDetailsSection !== undefined) {
			childSections.push(...renderedDetailsSection);
		}
	}

	return config.defaultSectionLayout(apiInterface, childSections, config);
}
