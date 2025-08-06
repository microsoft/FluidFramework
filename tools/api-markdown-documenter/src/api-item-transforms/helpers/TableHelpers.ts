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
import type { Html, PhrasingContent, Table, TableCell, TableRow } from "mdast";
import { toHast } from "mdast-util-to-hast";

import type { Section } from "../../mdast/index.js";
import {
	type ApiFunctionLike,
	type ApiModifier,
	getDefaultValueBlock,
	getModifiers,
	injectSeparator,
} from "../../utilities/index.js";
import { getLinkForApiItem } from "../ApiItemTransformUtilities.js";
import { transformTsdoc } from "../TsdocNodeTransforms.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { createExcerptSpanWithHyperlinks } from "./Helpers.js";

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
export function createTableWithHeading(
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
export function createSummaryTable(
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

	// Only display "Alerts" column if there are any alerts to display.
	const alerts = apiItems.map((apiItem) => config.getAlertsForItem(apiItem));
	const hasAlerts = alerts.some((itemAlerts) => itemAlerts.length > 0);

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiItems.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);

	const headerRowCells: TableCell[] = [
		createPlainTextTableCell(getTableHeadingTitleForApiKind(itemKind)),
	];
	if (hasAlerts) {
		headerRowCells.push(createPlainTextTableCell("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(createPlainTextTableCell("Modifiers"));
	}
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	const bodyRows: TableRow[] = [];
	for (let i = 0; i < apiItems.length; i++) {
		const bodyRowCells: TableCell[] = [createApiTitleCell(apiItems[i], config)];
		if (hasAlerts) {
			bodyRowCells.push(createAlertsCell(alerts[i]));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiItems[i], options?.modifiersToOmit));
		}
		bodyRowCells.push(createApiSummaryCell(apiItems[i], config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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
): Table {
	// Only display "Modifiers" column if there are any optional parameters present.
	const hasOptionalParameters = apiParameters.some((apiParameter) => apiParameter.isOptional);

	const headerRowCells: TableCell[] = [createPlainTextTableCell("Parameter")];
	if (hasOptionalParameters) {
		headerRowCells.push(createPlainTextTableCell("Modifiers"));
	}
	headerRowCells.push(createPlainTextTableCell("Type"));
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	function createModifierCell(apiParameter: Parameter): TableCell {
		return apiParameter.isOptional ? createPlainTextTableCell("optional") : emptyTableCell;
	}

	const bodyRows: TableRow[] = [];
	for (const apiParameter of apiParameters) {
		const bodyRowCells: TableCell[] = [createParameterTitleCell(apiParameter)];
		if (hasOptionalParameters) {
			bodyRowCells.push(createModifierCell(apiParameter));
		}
		bodyRowCells.push(createParameterTypeCell(apiParameter, config));
		bodyRowCells.push(createParameterSummaryCell(apiParameter, contextApiItem, config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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
): Table {
	// Only display the "Constraint" column if there are any constraints present among the type parameters.
	const hasAnyConstraints = apiTypeParameters.some(
		(apiTypeParameter) => !apiTypeParameter.constraintExcerpt.isEmpty,
	);

	// Only display the "Default" column if there are any defaults present among the type parameters.
	const hasAnyDefaults = apiTypeParameters.some(
		(apiTypeParameter) => !apiTypeParameter.defaultTypeExcerpt.isEmpty,
	);

	const headerRowCells: TableCell[] = [createPlainTextTableCell("Parameter")];
	if (hasAnyConstraints) {
		headerRowCells.push(createPlainTextTableCell("Constraint"));
	}
	if (hasAnyDefaults) {
		headerRowCells.push(createPlainTextTableCell("Default"));
	}
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	function createTypeConstraintCell(apiParameter: TypeParameter): TableCell {
		const constraintSpan = createExcerptSpanWithHyperlinks(
			apiParameter.constraintExcerpt,
			config,
		);
		return {
			type: "tableCell",
			children: constraintSpan,
		};
	}

	function createTypeDefaultCell(apiParameter: TypeParameter): TableCell {
		const excerptSpan = createExcerptSpanWithHyperlinks(
			apiParameter.defaultTypeExcerpt,
			config,
		);
		return {
			type: "tableCell",
			children: excerptSpan,
		};
	}

	const bodyRows: TableRow[] = [];
	for (const apiTypeParameter of apiTypeParameters) {
		const bodyRowCells: TableCell[] = [createPlainTextTableCell(apiTypeParameter.name)];
		if (hasAnyConstraints) {
			bodyRowCells.push(createTypeConstraintCell(apiTypeParameter));
		}
		if (hasAnyDefaults) {
			bodyRowCells.push(createTypeDefaultCell(apiTypeParameter));
		}
		bodyRowCells.push(
			createTypeParameterSummaryCell(apiTypeParameter, contextApiItem, config),
		);

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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

	// Only display "Alerts" column if there are any alerts to display.
	const alerts = apiItems.map((apiItem) => config.getAlertsForItem(apiItem));
	const hasAlerts = alerts.some((itemAlerts) => itemAlerts.length > 0);

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiItems.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);
	const hasReturnTypes = apiItems.some((apiItem) => ApiReturnTypeMixin.isBaseClassOf(apiItem));

	const headerRowCells: TableCell[] = [
		createPlainTextTableCell(getTableHeadingTitleForApiKind(itemKind)),
	];
	if (hasAlerts) {
		headerRowCells.push(createPlainTextTableCell("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(createPlainTextTableCell("Modifiers"));
	}
	if (hasReturnTypes) {
		headerRowCells.push(createPlainTextTableCell("Return Type"));
	}
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	const bodyRows: TableRow[] = [];
	for (let i = 0; i < apiItems.length; i++) {
		const bodyRowCells: TableCell[] = [createApiTitleCell(apiItems[i], config)];
		if (hasAlerts) {
			bodyRowCells.push(createAlertsCell(alerts[i]));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiItems[i], options?.modifiersToOmit));
		}
		if (hasReturnTypes) {
			bodyRowCells.push(createReturnTypeCell(apiItems[i], config));
		}
		bodyRowCells.push(createApiSummaryCell(apiItems[i], config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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

	// Only display "Alerts" column if there are any alerts to display.
	const alerts = apiProperties.map((apiItem) => config.getAlertsForItem(apiItem));
	const hasAlerts = alerts.some((itemAlerts) => itemAlerts.length > 0);

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiProperties.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);
	const hasDefaultValues = apiProperties.some(
		(apiItem) => getDefaultValueBlock(apiItem, config.logger) !== undefined,
	);

	const headerRowCells: TableCell[] = [createPlainTextTableCell("Property")];
	if (hasAlerts) {
		headerRowCells.push(createPlainTextTableCell("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(createPlainTextTableCell("Modifiers"));
	}
	if (hasDefaultValues) {
		headerRowCells.push(createPlainTextTableCell("Default Value"));
	}
	headerRowCells.push(createPlainTextTableCell("Type"));
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	const bodyRows: TableRow[] = [];
	for (let i = 0; i < apiProperties.length; i++) {
		const bodyRowCells: TableCell[] = [createApiTitleCell(apiProperties[i], config)];
		if (hasAlerts) {
			bodyRowCells.push(createAlertsCell(alerts[i]));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiProperties[i], options?.modifiersToOmit));
		}
		if (hasDefaultValues) {
			bodyRowCells.push(createDefaultValueCell(apiProperties[i], config));
		}
		bodyRowCells.push(createTypeExcerptCell(apiProperties[i].propertyTypeExcerpt, config));
		bodyRowCells.push(createApiSummaryCell(apiProperties[i], config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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

	// Only display "Alerts" column if there are any alerts to display.
	const alerts = apiVariables.map((apiItem) => config.getAlertsForItem(apiItem));
	const hasAlerts = alerts.some((itemAlerts) => itemAlerts.length > 0);

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiVariables.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);

	const headerRowCells: TableCell[] = [createPlainTextTableCell("Variable")];
	if (hasAlerts) {
		headerRowCells.push(createPlainTextTableCell("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(createPlainTextTableCell("Modifiers"));
	}
	headerRowCells.push(createPlainTextTableCell("Type"));
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	const bodyRows: TableRow[] = [];
	for (let i = 0; i < apiVariables.length; i++) {
		const bodyRowCells: TableCell[] = [createApiTitleCell(apiVariables[i], config)];
		if (hasAlerts) {
			bodyRowCells.push(createAlertsCell(alerts[i]));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiVariables[i], options?.modifiersToOmit));
		}
		bodyRowCells.push(createTypeExcerptCell(apiVariables[i].variableTypeExcerpt, config));
		bodyRowCells.push(createApiSummaryCell(apiVariables[i], config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
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

	// Only display "Alerts" column if there are any alerts to display.
	const alerts = apiPackages.map((apiItem) => config.getAlertsForItem(apiItem));
	const hasAlerts = alerts.some((itemAlerts) => itemAlerts.length > 0);

	const headerRowCells: TableCell[] = [createPlainTextTableCell("Package")];
	if (hasAlerts) {
		headerRowCells.push(createPlainTextTableCell("Alerts"));
	}
	headerRowCells.push(createPlainTextTableCell("Description"));
	const headerRow: TableRow = {
		type: "tableRow",
		children: headerRowCells,
	};

	const bodyRows: TableRow[] = [];
	for (let i = 0; i < apiPackages.length; i++) {
		const bodyRowCells: TableCell[] = [createApiTitleCell(apiPackages[i], config)];
		if (hasAlerts) {
			bodyRowCells.push(createAlertsCell(alerts[i]));
		}
		bodyRowCells.push(createApiSummaryCell(apiPackages[i], config));

		bodyRows.push({
			type: "tableRow",
			children: bodyRowCells,
		});
	}

	return {
		type: "table",
		children: [headerRow, ...bodyRows],
	};
}

/**
 * Creates a table cell containing the description (summary) comment for the provided API item.
 * If the item has an `@beta` release tag, the comment will be annotated as being beta content.
 *
 * @param apiItem - The API item whose comment will be rendered in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createApiSummaryCell(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	if (apiItem instanceof ApiDocumentedItem && apiItem.tsdocComment !== undefined) {
		return createTableCellFromTsdocSection(
			apiItem.tsdocComment.summarySection,
			apiItem,
			config,
		);
	}

	return emptyTableCell;
}

/**
 * Creates a table cell containing the return type information for the provided function-like API item,
 * if it specifies one. If it does not specify a type, an empty table cell will be used.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiItem - The API item whose return type will be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createReturnTypeCell(
	apiItem: ApiFunctionLike,
	config: ApiItemTransformationConfiguration,
): TableCell {
	return ApiReturnTypeMixin.isBaseClassOf(apiItem)
		? createTypeExcerptCell(apiItem.returnTypeExcerpt, config)
		: emptyTableCell;
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
export function createApiTitleCell(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	const link = getLinkForApiItem(apiItem, config);
	return {
		type: "tableCell",
		children: [
			{
				type: "link",
				url: link.target,
				children: [{ type: "text", value: link.text }],
			},
		],
	};
}

/**
 * Creates a table cell containing a list of modifiers that apply.
 *
 * @param apiItem - The API item whose modifiers will be displayed in the cell.
 * @param modifiersToOmit - List of modifiers to omit from the generated cell, even if they apply to the item.
 */
export function createModifiersCell(
	apiItem: ApiItem,
	modifiersToOmit?: ApiModifier[],
): TableCell {
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
		? emptyTableCell
		: {
				type: "tableCell",
				children: contents,
			};
}

/**
 * Creates a table cell containing the `@defaultValue` comment of the API item if it has one.
 *
 * @param apiItem - The API item whose `@defaultValue` comment will be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createDefaultValueCell(
	apiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	const defaultValueSection = getDefaultValueBlock(apiItem, config.logger);

	if (defaultValueSection === undefined) {
		return emptyTableCell;
	}

	return createTableCellFromTsdocSection(defaultValueSection, apiItem, config);
}

/**
 * Creates a table cell containing the provided alerts, displayed as comma-separated codespan nodes.
 *
 * @param apiItem - The alert values to display.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createAlertsCell(alerts: string[]): TableCell {
	const alertNodes: PhrasingContent[] = alerts.map((alert) => ({
		type: "inlineCode",
		value: alert,
	}));

	return alerts.length === 0
		? emptyTableCell
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
export function createParameterTitleCell(apiParameter: Parameter): TableCell {
	return createPlainTextTableCell(apiParameter.name);
}

/**
 * Creates a table cell containing the type information about the provided parameter.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The parameter whose type information will be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createParameterTypeCell(
	apiParameter: Parameter,
	config: ApiItemTransformationConfiguration,
): TableCell {
	return createTypeExcerptCell(apiParameter.parameterTypeExcerpt, config);
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
export function createParameterSummaryCell(
	apiParameter: Parameter,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	if (apiParameter.tsdocParamBlock === undefined) {
		return emptyTableCell;
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
export function createTypeParameterSummaryCell(
	apiTypeParameter: TypeParameter,
	contextApiItem: ApiItem,
	config: ApiItemTransformationConfiguration,
): TableCell {
	if (apiTypeParameter.tsdocTypeParamBlock === undefined) {
		return emptyTableCell;
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
export function createTypeExcerptCell(
	typeExcerpt: Excerpt,
	config: ApiItemTransformationConfiguration,
): TableCell {
	const excerptSpan = createExcerptSpanWithHyperlinks(typeExcerpt, config);
	return {
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
): TableCell {
	const transformed = transformTsdoc(tsdocSection, contextApiItem, config);

	if (transformed.length === 0) {
		return emptyTableCell;
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

const emptyTableCell: TableCell = {
	type: "tableCell",
	children: [],
};

function createPlainTextTableCell(text: string): TableCell {
	return {
		type: "tableCell",
		children: [{ type: "text", value: text }],
	};
}
