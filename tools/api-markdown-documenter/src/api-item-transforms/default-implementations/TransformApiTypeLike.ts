/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ApiCallSignature,
	type ApiConstructor,
	type ApiIndexSignature,
	type ApiItem,
	ApiItemKind,
	type ApiMethod,
	type ApiPropertyItem,
	ApiReturnTypeMixin,
} from "@microsoft/api-extractor-model";
import type { PhrasingContent, Table, TableCell } from "mdast";

import type { Section } from "../../mdast/index.js";
import {
	ApiModifier,
	getApiItemKind,
	getDefaultValueBlock,
	getScopedMemberNameForDiagnostics,
	isStatic,
	type ApiConstructorLike,
	type ApiFunctionLike,
	type ApiTypeLike,
} from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import {
	createChildDetailsSection,
	createDefaultSummaryTable,
	createTypeExcerptCell,
	type TableCreationOptions,
	createTableFromItems,
	createAlertsCell,
	createModifiersCell,
	createDescriptionCell,
	createTableCellFromTsdocSection,
} from "../helpers/index.js";
import { getLinkForApiItem, getTypeMembers, type TypeMember } from "../utilities/index.js";

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

		// Render child item details for any items that don't get their own document
		const detailsSections = createMemberDetailsSection(
			constructors,
			standardProperties,
			eventProperties,
			callSignatures,
			indexSignatures,
			allMethods,
			config,
			generateChildContent,
		);

		if (detailsSections !== undefined) {
			sections.push(...detailsSections);
		}
	}

	return config.defaultSectionLayout(apiItem, sections, config);
}

// TODO: docs
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
		createFunctionLikeSummaryTable(constructors, "Constructor", config),
		"Constructors",
	);

	addTableSection(
		createPropertiesTable(staticEventProperties, config, {
			modifiersToOmit: [ApiModifier.Static],
		}),
		"Static Events",
	);

	addTableSection(
		createPropertiesTable(staticStandardProperties, config, {
			modifiersToOmit: [ApiModifier.Static],
		}),
		"Static Properties",
	);

	addTableSection(
		createFunctionLikeSummaryTable(staticMethods, "Method", config, {
			modifiersToOmit: [ApiModifier.Static],
		}),
		"Static Methods",
	);

	addTableSection(createPropertiesTable(nonStaticEventProperties, config), "Events");

	addTableSection(createPropertiesTable(nonStaticStandardProperties, config), "Properties");

	addTableSection(
		createFunctionLikeSummaryTable(nonStaticMethods, "Method", config),
		"Methods",
	);

	addTableSection(
		createFunctionLikeSummaryTable(callSignatures, "Call Signature", config),
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

/**
 * Creates a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param members - The function-like members to be displayed.
 * @param nameColumnLabel - The label for the "name" column in the table.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
function createFunctionLikeSummaryTable(
	members: readonly TypeMember<ApiFunctionLike>[],
	nameColumnLabel: string,
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (members.length === 0) {
		return undefined;
	}

	function createReturnTypeCell(apiItem: ApiFunctionLike): TableCell | undefined {
		return ApiReturnTypeMixin.isBaseClassOf(apiItem)
			? createTypeExcerptCell(apiItem.returnTypeExcerpt, config)
			: undefined;
	}

	return createTableFromItems(members, {
		columnOptions: [
			{
				title: { type: "text", value: nameColumnLabel },
				columnKind: "required",
				createCellContent: (member) => createNameCell(member, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (member) => createAlertsCell(config.getAlertsForItem(member.item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (member) =>
					createModifiersCell(member.item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Return Type" },
				columnKind: "optional",
				createCellContent: (member) => createReturnTypeCell(member.item),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (member) => createDescriptionCell(member.item, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param members - The `Property` members to be displayed.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
function createPropertiesTable(
	members: readonly TypeMember<ApiPropertyItem>[],
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (members.length === 0) {
		return undefined;
	}

	function createDefaultValueCell(apiItem: ApiItem): TableCell | undefined {
		const defaultValueSection = getDefaultValueBlock(apiItem, config.logger);
		return defaultValueSection === undefined
			? undefined
			: createTableCellFromTsdocSection(defaultValueSection, apiItem, config);
	}

	return createTableFromItems(members, {
		columnOptions: [
			{
				title: { type: "text", value: "Property" },
				columnKind: "required",
				createCellContent: (member) => createNameCell(member, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (member) => createAlertsCell(config.getAlertsForItem(member.item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (member) =>
					createModifiersCell(member.item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Default Value" },
				columnKind: "optional",
				createCellContent: (member) => createDefaultValueCell(member.item),
			},
			{
				title: { type: "text", value: "Type" },
				columnKind: "required",
				createCellContent: (member) =>
					createTypeExcerptCell(member.item.propertyTypeExcerpt, config),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (member) => createDescriptionCell(member.item, config),
			},
		],
	});
}

/**
 * Creates a table cell containing the name of the provided API item.
 *
 * @remarks This content will be generated as a link to the section content describing the API item.
 *
 * @param member - The member whose name will be displayed in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createNameCell(
	member: TypeMember,
	config: ApiItemTransformationConfiguration,
): TableCell {
	const link = getLinkForApiItem(member.item, config);

	let cellContent: PhrasingContent[] = [link];
	if (member.kind === "inherited") {
		// If this member is inherited from a base type, note that and link to the base type.
		const baseLink = getLinkForApiItem(member.baseDefinition, config);
		cellContent = [
			link,
			{ type: "html", value: "<br/>" },
			{
				type: "emphasis",
				children: [
					{ type: "text", value: "(inherited from " },
					baseLink,
					{ type: "text", value: ")" },
				],
			},
		];
	} else if (member.baseDefinition !== undefined) {
		// If this member overrides a member on some base type, note that and link to both the base type and the overridden member.
		assert(
			member.baseDefinition.parent !== undefined,
			"Overridden member must have a parent.",
		);
		const baseTypeLink = getLinkForApiItem(member.baseDefinition.parent, config);
		const baseMemberLink = getLinkForApiItem(member.baseDefinition, config);
		cellContent = [
			link,
			{ type: "html", value: "<br/>" },
			{
				type: "emphasis",
				children: [
					{ type: "text", value: "(base definition: " },
					baseTypeLink,
					{ type: "text", value: "." },
					baseMemberLink,
					{ type: "text", value: ")" },
				],
			},
		];
	}

	return {
		type: "tableCell",
		children: cellContent,
	};
}

function createMemberDetailsSection(
	constructors: TypeMember<ApiConstructorLike>[],
	standardProperties: TypeMember<ApiPropertyItem>[],
	eventProperties: TypeMember<ApiPropertyItem>[],
	callSignatures: TypeMember<ApiCallSignature>[],
	indexSignatures: TypeMember<ApiIndexSignature>[],
	methods: TypeMember<ApiMethod>[],
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => Section[],
): Section[] | undefined {
	// Only display details for "own" members, since inherited members will have docs generated from the base type.
	const ownConstructors = constructors
		.filter((member) => member.kind === "own")
		.map((member) => member.item);
	const ownEventProperties = eventProperties
		.filter((member) => member.kind === "own")
		.map((member) => member.item);
	const ownStandardProperties = standardProperties
		.filter((member) => member.kind === "own")
		.map((member) => member.item);
	const ownMethods = methods
		.filter((member) => member.kind === "own")
		.map((member) => member.item);
	const ownCallSignatures = callSignatures
		.filter((member) => member.kind === "own")
		.map((member) => member.item);
	const ownIndexSignatures = indexSignatures
		.filter((member) => member.kind === "own")
		.map((member) => member.item);

	return createChildDetailsSection(
		[
			{
				heading: { type: "sectionHeading", title: "Constructor Details" },
				itemKind: ApiItemKind.Constructor,
				items: ownConstructors,
			},
			{
				heading: { type: "sectionHeading", title: "Event Details" },
				itemKind: ApiItemKind.Property,
				items: ownEventProperties,
			},
			{
				heading: { type: "sectionHeading", title: "Property Details" },
				itemKind: ApiItemKind.Property,
				items: ownStandardProperties,
			},
			{
				heading: { type: "sectionHeading", title: "Method Details" },
				itemKind: ApiItemKind.MethodSignature,
				items: ownMethods,
			},
			{
				heading: { type: "sectionHeading", title: "Call Signature Details" },
				itemKind: ApiItemKind.CallSignature,
				items: ownCallSignatures,
			},
			{
				heading: { type: "sectionHeading", title: "Index Signature Details" },
				itemKind: ApiItemKind.IndexSignature,
				items: ownIndexSignatures,
			},
		],
		config,
		generateChildContent,
	);
}
