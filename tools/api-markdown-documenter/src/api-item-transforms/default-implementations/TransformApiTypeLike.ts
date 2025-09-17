/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiCallSignature,
	type ApiConstructor,
	type ApiIndexSignature,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiPropertyItem,
} from "@microsoft/api-extractor-model";
import type { Table } from "mdast";

import type { Section } from "../../mdast/index.js";
import {
	ApiModifier,
	getApiItemKind,
	getScopedMemberNameForDiagnostics,
	isStatic,
	type ApiConstructorLike,
	type ApiTypeLike,
} from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import {
	createChildDetailsSection,
	createDefaultSummaryTable,
	createFunctionLikeSummaryTable,
	createPropertiesTable,
} from "../helpers/index.js";
import { getTypeMembers, type TypeMember } from "../utilities/index.js";

// TODOs:
// - inherit type param docs from base types?
// - inherit method param docs from base types?

/**
 * Default documentation transform for {@link ApiTypeLike | type-like} API items.
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
 * Details (for any types not rendered to their own documents - see {@link ApiItemTransformationOptions.hierarchy})
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
export function transformApiTypeLike(
	apiItem: ApiTypeLike,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => Section[],
): Section[] {
	const sections: Section[] = [];

	// Get all of the type's members, including applicable inherited members.
	// All of these members will be displayed in the summary tables,
	// but only the "own" members will be displayed in the details sections.
	// Inherited members' table entries will link to the details section of the document
	// for the type from which they are inherited.
	const members = getTypeMembers(apiItem, config);

	// TODO: display some sort of icon / notation for inherited members? ⤴️⤵️

	if (members.length > 0) {
		// Accumulate child items
		const constructors: TypeMember<ApiConstructorLike>[] = [];
		const allProperties: TypeMember<ApiPropertyItem>[] = [];
		const callSignatures: TypeMember<ApiCallSignature>[] = [];
		const indexSignatures: TypeMember<ApiIndexSignature>[] = [];
		const allMethods: TypeMember<ApiMethod>[] = [];
		for (const member of members) {
			const childKind = getApiItemKind(member.item);
			switch (childKind) {
				case ApiItemKind.Constructor:
				case ApiItemKind.ConstructSignature: {
					constructors.push(member as TypeMember<ApiConstructor>);
					break;
				}
				case ApiItemKind.Property:
				case ApiItemKind.PropertySignature: {
					allProperties.push(member as TypeMember<ApiPropertyItem>);
					break;
				}
				case ApiItemKind.CallSignature: {
					callSignatures.push(member as TypeMember<ApiCallSignature>);
					break;
				}
				case ApiItemKind.IndexSignature: {
					indexSignatures.push(member as TypeMember<ApiIndexSignature>);
					break;
				}
				case ApiItemKind.Method:
				case ApiItemKind.MethodSignature: {
					allMethods.push(member as TypeMember<ApiMethod>);
					break;
				}
				default: {
					config.logger?.error(
						`Child item "${member.item.displayName}" of ${
							apiItem.kind
						} "${getScopedMemberNameForDiagnostics(
							apiItem,
						)}" is of unsupported API item kind: "${childKind}"`,
					);
					break;
				}
			}
		}

		// Split properties into event properties and non-event properties
		const standardProperties = allProperties.filter(
			(apiProperty) => !apiProperty.item.isEventProperty,
		);
		const eventProperties = allProperties.filter(
			(apiProperty) => apiProperty.item.isEventProperty,
		);

		// Render summary tables
		const memberTableSections = createSummaryTables(
			constructors,
			standardProperties,
			eventProperties,
			callSignatures,
			indexSignatures,
			allMethods,
			config,
		);

		if (memberTableSections !== undefined) {
			sections.push(...memberTableSections);
		}

		// Render child item details if there are any that will not be rendered to their own documents
		const detailsSections = createChildDetailsSection(
			[
				{
					heading: { type: "sectionHeading", title: "Constructor Details" },
					itemKind: ApiItemKind.Constructor,
					items: constructors
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
				{
					heading: { type: "sectionHeading", title: "Event Details" },
					itemKind: ApiItemKind.Property,
					items: eventProperties
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
				{
					heading: { type: "sectionHeading", title: "Property Details" },
					itemKind: ApiItemKind.Property,
					items: standardProperties
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
				{
					heading: { type: "sectionHeading", title: "Method Details" },
					itemKind: ApiItemKind.MethodSignature,
					items: allMethods
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
				{
					heading: { type: "sectionHeading", title: "Call Signature Details" },
					itemKind: ApiItemKind.CallSignature,
					items: callSignatures
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
				{
					heading: { type: "sectionHeading", title: "Index Signature Details" },
					itemKind: ApiItemKind.IndexSignature,
					items: indexSignatures
						.filter((member) => member.kind === "own")
						.map((member) => member.item),
				},
			],
			config,
			generateChildContent,
		);

		if (detailsSections !== undefined && detailsSections.length > 0) {
			sections.push(...detailsSections);
		}
	}

	return config.defaultSectionLayout(apiItem, sections, config);
}

function createSummaryTables(
	constructors: TypeMember<ApiConstructorLike>[],
	standardProperties: TypeMember<ApiPropertyItem>[],
	eventProperties: TypeMember<ApiPropertyItem>[],
	callSignatures: TypeMember<ApiCallSignature>[],
	indexSignatures: TypeMember<ApiIndexSignature>[],
	methods: TypeMember<ApiMethod>[],
	config: ApiItemTransformationConfiguration,
): Section[] {
	// Further split event/standard properties into static and non-static
	const staticStandardProperties = standardProperties.filter((apiProperty) =>
		isStatic(apiProperty.item),
	);
	const nonStaticStandardProperties = standardProperties.filter(
		(apiProperty) => !isStatic(apiProperty.item),
	);
	const staticEventProperties = eventProperties.filter((apiProperty) =>
		isStatic(apiProperty.item),
	);
	const nonStaticEventProperties = eventProperties.filter(
		(apiProperty) => !isStatic(apiProperty.item),
	);

	// Split methods into static and non-static methods
	const staticMethods = methods.filter((apiMethod) => isStatic(apiMethod.item));
	const nonStaticMethods = methods.filter((apiMethod) => !isStatic(apiMethod.item));

	const sections: Section[] = [];

	function addTableSection(table: Table | undefined, title: string): void {
		if (table !== undefined) {
			sections.push({
				type: "section",
				heading: { type: "sectionHeading", title },
				children: [table],
			});
		}
	}

	addTableSection(
		createFunctionLikeSummaryTable(
			constructors.map((member) => member.item),
			"Constructor",
			config,
		),
		"Constructors",
	);

	addTableSection(
		createPropertiesTable(
			staticEventProperties.map((member) => member.item),
			config,
			{
				modifiersToOmit: [ApiModifier.Static],
			},
		),
		"Static Events",
	);

	addTableSection(
		createPropertiesTable(
			staticStandardProperties.map((member) => member.item),
			config,
			{
				modifiersToOmit: [ApiModifier.Static],
			},
		),
		"Static Properties",
	);

	addTableSection(
		createFunctionLikeSummaryTable(
			staticMethods.map((member) => member.item),
			"Method",
			config,
			{
				modifiersToOmit: [ApiModifier.Static],
			},
		),
		"Static Methods",
	);

	addTableSection(
		createPropertiesTable(
			nonStaticEventProperties.map((member) => member.item),
			config,
		),
		"Events",
	);

	addTableSection(
		createPropertiesTable(
			nonStaticStandardProperties.map((member) => member.item),
			config,
		),
		"Properties",
	);

	addTableSection(
		createFunctionLikeSummaryTable(
			nonStaticMethods.map((member) => member.item),
			"Method",
			config,
		),
		"Methods",
	);

	addTableSection(
		createFunctionLikeSummaryTable(
			callSignatures.map((member) => member.item),
			"Call Signature",
			config,
		),
		"Call Signatures",
	);

	addTableSection(
		createDefaultSummaryTable(
			indexSignatures.map((member) => member.item),
			ApiItemKind.IndexSignature,
			config,
		),
		"Index Signatures",
	);

	return sections;
}
