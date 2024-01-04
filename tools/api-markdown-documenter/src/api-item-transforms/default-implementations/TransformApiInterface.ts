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
	type ApiPropertySignature,
} from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain";
import { filterByKind } from "../../utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createChildDetailsSection, createMemberTables } from "../helpers";
import { filterChildMembers } from "../ApiItemTransformUtilities";

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
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const childSections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiInterface, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const constructSignatures = filterByKind(apiInterface.members, [
			ApiItemKind.ConstructSignature,
		]).map((apiItem) => apiItem as ApiConstructSignature);

		const allProperties = filterByKind(apiInterface.members, [
			ApiItemKind.PropertySignature,
		]).map((apiItem) => apiItem as ApiPropertySignature);

		// Split properties into event properties and non-event properties
		const standardProperties = allProperties.filter(
			(apiProperty) => !apiProperty.isEventProperty,
		);
		const eventProperties = allProperties.filter((apiProperty) => apiProperty.isEventProperty);

		const callSignatures = filterByKind(apiInterface.members, [ApiItemKind.CallSignature]).map(
			(apiItem) => apiItem as ApiCallSignature,
		);

		const indexSignatures = filterByKind(apiInterface.members, [
			ApiItemKind.IndexSignature,
		]).map((apiItem) => apiItem as ApiIndexSignature);

		const methods = filterByKind(apiInterface.members, [ApiItemKind.MethodSignature]).map(
			(apiItem) => apiItem as ApiMethodSignature,
		);

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

	return config.createDefaultLayout(apiInterface, childSections, config);
}
