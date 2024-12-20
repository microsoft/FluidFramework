/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiClass,
	type ApiConstructor,
	type ApiIndexSignature,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiPropertyItem,
} from "@microsoft/api-extractor-model";

import type { SectionNode } from "../../documentation-domain/index.js";
import { ApiModifier, getScopedMemberNameForDiagnostics, isStatic } from "../../utilities/index.js";
import { filterChildMembers } from "../ApiItemTransformUtilities.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createChildDetailsSection, createMemberTables } from "../helpers/index.js";

/**
 * Default documentation transform for `Class` items.
 *
 * @remarks Format:
 *
 * Tables
 *
 * - constructors
 *
 * - (static) event properties
 *
 * - (static) properties
 *
 * - (static) methods
 *
 * - (non-static) event properties
 *
 * - (non-static) properties
 *
 * - (non-static) methods
 *
 * - call-signatures
 *
 * - index-signatures
 *
 * Details (for any types not rendered to their own documents - see {@link DocumentationSuiteOptions.documentBoundaries})
 *
 * - constructors
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
export function transformApiClass(
	apiClass: ApiClass,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const sections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiClass, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const constructors: ApiConstructor[] = [];
		const allProperties: ApiPropertyItem[] = [];
		const callSignatures: ApiCallSignature[] = [];
		const indexSignatures: ApiIndexSignature[] = [];
		const allMethods: ApiMethod[] = [];
		for (const child of filteredChildren) {
			switch (child.kind) {
				case ApiItemKind.Constructor: {
					constructors.push(child as ApiConstructor);
					break;
				}
				case ApiItemKind.Property: {
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
				case ApiItemKind.Method: {
					allMethods.push(child as ApiMethod);
					break;
				}
				default: {
					config.logger?.error(
						`Child item "${
							child.displayName
						}" of Class "${getScopedMemberNameForDiagnostics(
							apiClass,
						)}" is of unsupported API item kind: "${child.kind}"`,
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

		// Further split event/standard properties into static and non-static
		const staticStandardProperties = standardProperties.filter((apiProperty) =>
			isStatic(apiProperty),
		);
		const nonStaticStandardProperties = standardProperties.filter(
			(apiProperty) => !isStatic(apiProperty),
		);
		const staticEventProperties = eventProperties.filter((apiProperty) =>
			isStatic(apiProperty),
		);
		const nonStaticEventProperties = eventProperties.filter(
			(apiProperty) => !isStatic(apiProperty),
		);

		// Split methods into static and non-static methods
		const staticMethods = allMethods.filter((apiMethod) => isStatic(apiMethod));
		const nonStaticMethods = allMethods.filter((apiMethod) => !isStatic(apiMethod));

		// Render summary tables
		const memberTableSections = createMemberTables(
			[
				{
					headingTitle: "Constructors",
					itemKind: ApiItemKind.Constructor,
					items: constructors,
				},
				{
					headingTitle: "Static Events",
					itemKind: ApiItemKind.Property,
					items: staticEventProperties,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
				},
				{
					headingTitle: "Static Properties",
					itemKind: ApiItemKind.Property,
					items: staticStandardProperties,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
				},
				{
					headingTitle: "Static Methods",
					itemKind: ApiItemKind.Method,
					items: staticMethods,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
				},
				{
					headingTitle: "Events",
					itemKind: ApiItemKind.Property,
					items: nonStaticEventProperties,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
				},
				{
					headingTitle: "Properties",
					itemKind: ApiItemKind.Property,
					items: nonStaticStandardProperties,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
				},
				{
					headingTitle: "Methods",
					itemKind: ApiItemKind.Method,
					items: nonStaticMethods,
					options: {
						modifiersToOmit: [ApiModifier.Static],
					},
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

		if (memberTableSections !== undefined) {
			sections.push(...memberTableSections);
		}

		// Render child item details if there are any that will not be rendered to their own documents
		const detailsSections = createChildDetailsSection(
			[
				{
					heading: { title: "Constructor Details" },
					itemKind: ApiItemKind.Constructor,
					items: constructors,
				},
				{
					heading: { title: "Event Details" },
					itemKind: ApiItemKind.Property,
					items: eventProperties,
				},
				{
					heading: { title: "Property Details" },
					itemKind: ApiItemKind.Property,
					items: standardProperties,
				},
				{
					heading: { title: "Method Details" },
					itemKind: ApiItemKind.MethodSignature,
					items: allMethods,
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

		if (detailsSections !== undefined && detailsSections.length > 0) {
			sections.push(...detailsSections);
		}
	}

	return config.transformations.createDefaultLayout(apiClass, sections, config);
}
