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
	type ApiProperty,
} from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain";
import { ApiModifier, filterByKind, isStatic } from "../../utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createChildDetailsSection, createMemberTables } from "../helpers";
import { filterChildMembers } from "../ApiItemTransformUtilities";

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
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const sections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiClass, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const constructors = filterByKind(apiClass.members, [ApiItemKind.Constructor]).map(
			(apiItem) => apiItem as ApiConstructor,
		);

		const allProperties = filterByKind(apiClass.members, [ApiItemKind.Property]).map(
			(apiItem) => apiItem as ApiProperty,
		);

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

		const callSignatures = filterByKind(apiClass.members, [ApiItemKind.CallSignature]).map(
			(apiItem) => apiItem as ApiCallSignature,
		);

		const indexSignatures = filterByKind(apiClass.members, [ApiItemKind.IndexSignature]).map(
			(apiItem) => apiItem as ApiIndexSignature,
		);

		const allMethods = filterByKind(apiClass.members, [ApiItemKind.Method]).map(
			(apiItem) => apiItem as ApiMethod,
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

	return config.createDefaultLayout(apiClass, sections, config);
}
