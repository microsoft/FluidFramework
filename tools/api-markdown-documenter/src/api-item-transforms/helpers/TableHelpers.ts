/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiDocumentedItem,
	type ApiItem,
	ApiItemKind,
	type ApiPackage,
	type ApiPropertyItem,
	ApiReturnTypeMixin,
	type Excerpt,
	type Parameter,
	type TypeParameter,
	type ApiVariable,
} from "@microsoft/api-extractor-model";
import type { DocSection } from "@microsoft/tsdoc";
import { toHtml } from "hast-util-to-html";
import type { Html, PhrasingContent, Table, TableCell } from "mdast";
import { toHast } from "mdast-util-to-hast";

import type { Section } from "../../mdast/index.js";
import {
	type ApiFunctionLike,
	type ApiModifier,
	getDefaultValueBlock,
	getModifiers,
	injectSeparator,
} from "../../utilities/index.js";
import { transformTsdoc } from "../TsdocNodeTransforms.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { getLinkForApiItem } from "../utilities/index.js";

import { createExcerptSpanWithHyperlinks } from "./Helpers.js";
import { createTableFromItems } from "./TableCreation.js";

/**
 * Input properties for creating a table of API members
 */
export interface MemberTableProperties {
	/**
	 * Heading text to display above the table contents.
	 */
	headingTitle: string;

	/**
	 * The kind of API item.
	 */
	itemKind: ApiItemKind;

	/**
	 * The items to be displayed as rows in the table.
	 */
	items: readonly ApiItem[];

	/**
	 * Creation options for the table.
	 */
	options?: TableCreationOptions;
}

/**
 * Content / formatting options for table creation.
 */
export interface TableCreationOptions {
	/**
	 * A list of modifiers to omit from table creation.
	 *
	 * @defaultValue No modifier kinds will be excluded.
	 */
	modifiersToOmit?: ApiModifier[];
}

/**
 * Creates a simple section containing a series of headings and tables, representing the API members of some parent
 * item, organized by kind.
 *
 * @param memberTableProperties - List of table configurations.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createMemberTables(
	memberTableProperties: readonly MemberTableProperties[],
	config: ApiItemTransformationConfiguration,
): Section[] | undefined {
	const sections: Section[] = [];

	for (const member of memberTableProperties) {
		const table = createTableWithHeading(member, config);
		if (table !== undefined) {
			sections.push(table);
		}
	}

	return sections.length === 0 ? undefined : sections;
}

/**
 * Creates a simple section containing a heading and a table, based on the provided properties.
 *
 * @param memberTableProperties - The table configuration.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createTableWithHeading(
	memberTableProperties: MemberTableProperties,
	config: ApiItemTransformationConfiguration,
): Section | undefined {
	const table = createSummaryTable(
		memberTableProperties.items,
		memberTableProperties.itemKind,
		config,
		memberTableProperties.options,
	);

	return table === undefined
		? undefined
		: {
				type: "section",
				children: [table],
				heading: {
					type: "sectionHeading",
					title: memberTableProperties.headingTitle,
				},
			};
}

/**
 * Creates a simple summary table for API items of the specified kind.
 * This is intended to represent a simple overview of the items.
 *
 * @remarks General use-case is to display a summary of child items of a given kind for some parent API item.
 *
 * @param apiItems - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being displayed in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
function createSummaryTable(
	apiItems: readonly ApiItem[],
	itemKind: ApiItemKind,
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (itemKind === ApiItemKind.Model || itemKind === ApiItemKind.EntryPoint) {
		throw new Error(
			`Summary table creation does not support provided API item kind: "${itemKind}".`,
		);
	}

	if (apiItems.length === 0) {
		return undefined;
	}

	switch (itemKind) {
		case ApiItemKind.ConstructSignature:
		case ApiItemKind.Constructor:
		case ApiItemKind.Function:
		case ApiItemKind.Method:
		case ApiItemKind.MethodSignature: {
			return createFunctionLikeSummaryTable(
				apiItems as ApiFunctionLike[],
				itemKind,
				config,
				options,
			);
		}

		case ApiItemKind.Property:
		case ApiItemKind.PropertySignature: {
			return createPropertiesTable(apiItems as ApiPropertyItem[], config, options);
		}

		case ApiItemKind.Variable: {
			return createVariablesTable(apiItems as ApiVariable[], config, options);
		}

		case ApiItemKind.Package: {
			return createPackagesTable(apiItems as ApiPackage[], config);
		}

		default: {
			return createDefaultSummaryTable(apiItems, itemKind, config, options);
		}
	}
}

// TODO: Remove this
/**
 * Default summary table generation. Displays each item's name, modifiers, and description (summary) comment.
 *
 * @param apiItems - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param itemKind - The kind of items being displayed in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createDefaultSummaryTable(
	apiItems: readonly ApiItem[],
	itemKind: ApiItemKind,
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (apiItems.length === 0) {
		return undefined;
	}

	return createTableFromItems(apiItems, {
		columnOptions: [
			{
				title: { type: "text", value: getTableHeadingTitleForApiKind(itemKind) },
				columnKind: "required",
				createCellContent: (item) => createNameCell(item, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (item) => createAlertsCell(config.getAlertsForItem(item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (item) => createModifiersCell(item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createDescriptionCell(item, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a series of parameters.
 * Displays each parameter's name, type, and description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment.
 *
 * @param apiParameters - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param contextApiItem - The API item with which the parameter is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createParametersSummaryTable(
	apiParameters: readonly Parameter[],
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): Table | undefined {
	if (apiParameters.length === 0) {
		return undefined;
	}

	function createModifierCell(apiParameter: Parameter): TableCell | undefined {
		return apiParameter.isOptional ? createPlainTextTableCell("optional") : undefined;
	}

	function createParameterTypeCell(apiParameter: Parameter): TableCell | undefined {
		return createTypeExcerptCell(apiParameter.parameterTypeExcerpt, config);
	}

	return createTableFromItems(apiParameters, {
		columnOptions: [
			{
				title: { type: "text", value: "Parameter" },
				columnKind: "required",
				createCellContent: (item) => createParameterTitleCell(item),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (item) => createModifierCell(item),
			},
			{
				title: { type: "text", value: "Type" },
				columnKind: "required",
				createCellContent: (item) => createParameterTypeCell(item),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createParameterSummaryCell(item, contextApiItem, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a series of type parameters.
 * Displays each parameter's name, type, and description ({@link https://tsdoc.org/pages/tags/typeparam/ | @typeParam}) comment.
 *
 * @param apiTypeParameters - The items to be displayed. All of these items must be of the kind specified via `itemKind`.
 * @param contextApiItem - The API item with which the parameter is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createTypeParametersSummaryTable(
	apiTypeParameters: readonly TypeParameter[],
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): Table | undefined {
	if (apiTypeParameters.length === 0) {
		return undefined;
	}

	function createTypeConstraintCell(apiParameter: TypeParameter): TableCell | undefined {
		const constraintSpan = createExcerptSpanWithHyperlinks(
			apiParameter.constraintExcerpt,
			config,
		);
		return constraintSpan.length === 0
			? undefined
			: {
					type: "tableCell",
					children: constraintSpan,
				};
	}

	function createTypeDefaultCell(apiParameter: TypeParameter): TableCell | undefined {
		const excerptSpan = createExcerptSpanWithHyperlinks(
			apiParameter.defaultTypeExcerpt,
			config,
		);
		return excerptSpan.length === 0
			? undefined
			: {
					type: "tableCell",
					children: excerptSpan,
				};
	}

	return createTableFromItems(apiTypeParameters, {
		columnOptions: [
			{
				title: { type: "text", value: "Parameter" },
				columnKind: "required",
				createCellContent: (item) => createPlainTextTableCell(item.name),
			},
			{
				title: { type: "text", value: "Constraint" },
				columnKind: "optional",
				createCellContent: (item) => createTypeConstraintCell(item),
			},
			{
				title: { type: "text", value: "Default" },
				columnKind: "optional",
				createCellContent: (item) => createTypeDefaultCell(item),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) =>
					createTypeParameterSummaryCell(item, contextApiItem, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for function-like API items (constructors, functions, methods).
 * Displays each item's name, modifiers, return type, and description (summary) comment.
 *
 * @param apiItems - The function-like items to be displayed.
 * @param itemKind - The kind of items being rendered in the table. Used to determine the semantic shape of the table.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createFunctionLikeSummaryTable(
	apiItems: readonly ApiFunctionLike[],
	itemKind: ApiItemKind,
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (apiItems.length === 0) {
		return undefined;
	}

	function createReturnTypeCell(apiItem: ApiFunctionLike): TableCell | undefined {
		return ApiReturnTypeMixin.isBaseClassOf(apiItem)
			? createTypeExcerptCell(apiItem.returnTypeExcerpt, config)
			: undefined;
	}

	return createTableFromItems(apiItems, {
		columnOptions: [
			{
				title: { type: "text", value: getTableHeadingTitleForApiKind(itemKind) },
				columnKind: "required",
				createCellContent: (item) => createNameCell(item, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (item) => createAlertsCell(config.getAlertsForItem(item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (item) => createModifiersCell(item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Return Type" },
				columnKind: "optional",
				createCellContent: (item) => createReturnTypeCell(item),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createDescriptionCell(item, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a series of properties.
 * Displays each property's name, modifiers, type, and description (summary) comment.
 *
 * @param apiProperties - The `Property` items to be displayed.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createPropertiesTable(
	apiProperties: readonly ApiPropertyItem[],
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (apiProperties.length === 0) {
		return undefined;
	}

	function createDefaultValueCell(apiItem: ApiItem): TableCell | undefined {
		const defaultValueSection = getDefaultValueBlock(apiItem, config.logger);
		return defaultValueSection === undefined
			? undefined
			: createTableCellFromTsdocSection(defaultValueSection, apiItem, config);
	}

	return createTableFromItems(apiProperties, {
		columnOptions: [
			{
				title: { type: "text", value: "Property" },
				columnKind: "required",
				createCellContent: (item) => createNameCell(item, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (item) => createAlertsCell(config.getAlertsForItem(item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (item) => createModifiersCell(item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Default Value" },
				columnKind: "optional",
				createCellContent: (item) => createDefaultValueCell(item),
			},
			{
				title: { type: "text", value: "Type" },
				columnKind: "required",
				createCellContent: (item) => createTypeExcerptCell(item.propertyTypeExcerpt, config),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createDescriptionCell(item, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a series of variable items.
 * Displays each variable's name, modifiers, type, and description (summary) comment.
 *
 * @param apiVariables - The `Variable` items to be displayed.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 * @param options - Table content / formatting options.
 */
export function createVariablesTable(
	apiVariables: readonly ApiVariable[],
	config: ApiItemTransformationConfiguration,
	options?: TableCreationOptions,
): Table | undefined {
	if (apiVariables.length === 0) {
		return undefined;
	}

	return createTableFromItems(apiVariables, {
		columnOptions: [
			{
				title: { type: "text", value: "Variable" },
				columnKind: "required",
				createCellContent: (item) => createNameCell(item, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (item) => createAlertsCell(config.getAlertsForItem(item)),
			},
			{
				title: { type: "text", value: "Modifiers" },
				columnKind: "optional",
				createCellContent: (item) => createModifiersCell(item, options?.modifiersToOmit),
			},
			{
				title: { type: "text", value: "Type" },
				columnKind: "required",
				createCellContent: (item) => createTypeExcerptCell(item.variableTypeExcerpt, config),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createDescriptionCell(item, config),
			},
		],
	});
}

/**
 * Creates a simple summary table for a list of packages.
 * Displays each package's name and description
 * ({@link https://tsdoc.org/pages/tags/packagedocumentation/ | @packageDocumentation}) comment.
 *
 * @param apiPackages - The package items to be displayed.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createPackagesTable(
	apiPackages: readonly ApiPackage[],
	config: ApiItemTransformationConfiguration,
): Table | undefined {
	if (apiPackages.length === 0) {
		return undefined;
	}

	return createTableFromItems(apiPackages, {
		columnOptions: [
			{
				title: { type: "text", value: "Package" },
				columnKind: "required",
				createCellContent: (item) => createNameCell(item, config),
			},
			{
				title: { type: "text", value: "Alerts" },
				columnKind: "optional",
				createCellContent: (item) => createAlertsCell(config.getAlertsForItem(item)),
			},
			{
				title: { type: "text", value: "Description" },
				columnKind: "required",
				createCellContent: (item) => createDescriptionCell(item, config),
			},
		],
	});
}

/**
 * Creates a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createDescriptionCell(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell | undefined {
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		return createTableCellFromTsdocSection(
			apiItem.tsdocComment.summarySection,
			apiItem,
			config,
		);
	}

	return undefined;
}

/**
 * Creates a table cell containing the name of the provided API item.
 *
 * @remarks This content will be generated as a link to the section content describing the API item.
 *
 * @param apiItem - The API item whose name will be displayed in the cell, and to whose content the generate link
 * will point.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createNameCell(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	const link = getLinkForApiItem(apiItem, config);
	return {
		type: "tableCell",
		children: [link],
	};
}

/**
 * Creates a table cell containing a list of modifiers that apply.
 *
 * @param apiItem - The API item whose modifiers will be displayed in the cell.
 * @param modifiersToOmit - List of modifiers to omit from the generated cell, even if they apply to the item.
 */
function createModifiersCell(
	apiItem: ApiItem,
	modifiersToOmit?: ApiModifier[],
): TableCell | undefined {
	const modifiers = getModifiers(apiItem, modifiersToOmit);

	const contents: PhrasingContent[] = [];
	let needsComma = false;
	for (const modifier of modifiers) {
		if (needsComma) {
			contents.push({ type: "text", value: ", " });
		}
		contents.push({ type: "inlineCode", value: modifier });
		needsComma = true;
	}

	return modifiers.length === 0
		? undefined
		: {
				type: "tableCell",
				children: contents,
			};
}

/**
 * Creates a table cell containing the provided alerts, displayed as comma-separated codespan nodes.
 *
 * @param apiItem - The alert values to display.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createAlertsCell(alerts: string[]): TableCell | undefined {
	const alertNodes: PhrasingContent[] = alerts.map((alert) => ({
		type: "inlineCode",
		value: alert,
	}));

	return alerts.length === 0
		? undefined
		: {
				type: "tableCell",
				children: injectSeparator(alertNodes, { type: "text", value: ", " }),
			};
}

/**
 * Creates a table cell containing the name of the provided parameter as plain text.
 *
 * @param apiParameter - The parameter whose name will be displayed in the cell.
 */
function createParameterTitleCell(apiParameter: Parameter): TableCell {
	return createPlainTextTableCell(apiParameter.name);
}

/**
 * Creates a table cell containing the description ({@link https://tsdoc.org/pages/tags/param/ | @param}) comment
 * of the provided parameter.
 * If the parameter has no documentation, an empty cell will be used.
 *
 * @param apiParameter - The parameter whose comment will be displayed in the cell.
 * @param contextApiItem - The API item with which the parameter is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createParameterSummaryCell(
	apiParameter: Parameter,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell | undefined {
	if (apiParameter.tsdocParamBlock === undefined) {
		return undefined;
	}

	return createTableCellFromTsdocSection(
		apiParameter.tsdocParamBlock.content,
		contextApiItem,
		config,
	);
}

/**
 * Creates a table cell containing the description ({@link https://tsdoc.org/pages/tags/typeparam/ | @typeParam}) comment
 * of the provided parameter.
 * If the parameter has no documentation, an empty cell will be used.
 *
 * @param apiTypeParameter - The type parameter whose comment will be displayed in the cell.
 * @param contextApiItem - The API item with which the parameter is associated.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createTypeParameterSummaryCell(
	apiTypeParameter: TypeParameter,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell | undefined {
	if (apiTypeParameter.tsdocTypeParamBlock === undefined) {
		return undefined;
	}

	return createTableCellFromTsdocSection(
		apiTypeParameter.tsdocTypeParamBlock.content,
		contextApiItem,
		config,
	);
}

/**
 * Creates a table cell containing type information.
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param typeExcerpt - An excerpt describing the type to be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
function createTypeExcerptCell(
	typeExcerpt: Excerpt,
	config: ApiItemTransformationConfiguration,
): TableCell | undefined {
	const excerptSpan = createExcerptSpanWithHyperlinks(typeExcerpt, config);
	return excerptSpan.length === 0
		? undefined
		: {
				type: "tableCell",
				children: excerptSpan,
			};
}

/**
 * Gets the appropriate heading title for the provided item kind to be used in table entries.
 */
function getTableHeadingTitleForApiKind(itemKind: ApiItemKind): string {
	switch (itemKind) {
		case ApiItemKind.EnumMember: {
			return "Flag";
		}
		case ApiItemKind.MethodSignature: {
			return ApiItemKind.Method;
		}
		case ApiItemKind.PropertySignature: {
			return ApiItemKind.Property;
		}
		default: {
			return itemKind;
		}
	}
}

/**
 * Transforms the contents of a TSDoc section node, and fine-tunes the output for use in a table cell.
 *
 * @remarks
 * Notably, this optimizes away the generation of paragraph nodes around inner contents when there is only a
 * single paragraph.
 */
function createTableCellFromTsdocSection(
	tsdocSection: DocSection,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell | undefined {
	const transformed = transformTsdoc(tsdocSection, contextApiItem, config);

	if (transformed.length === 0) {
		return undefined;
	}

	// If the transformed contents consist of a single paragraph (common case), inline that paragraph's contents
	// directly in the cell.
	if (transformed.length === 1 && transformed[0].type === "paragraph") {
		return {
			type: "tableCell",
			children: transformed[0].children,
		};
	}

	// `mdast` does not allow block content in table cells, but we want to be able to include things like fenced code blocks, etc. in our table cells.
	// To accommodate this, we convert the contents to HTML and put that inside the table cell.
	const htmlTrees = transformed.map((node) => toHast(node));
	const htmlNodes: Html[] = htmlTrees.map((node) => ({
		type: "html",
		value: toHtml(node),
	}));
	return {
		type: "tableCell",
		children: htmlNodes,
	};
}

function createPlainTextTableCell(text: string): TableCell {
	return {
		type: "tableCell",
		children: [{ type: "text", value: text }],
	};
}
