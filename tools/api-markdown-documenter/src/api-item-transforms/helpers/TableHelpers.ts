/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ApiDocumentedItem,
	ApiItem,
	ApiItemKind,
	ApiPackage,
	ApiPropertyItem,
	ApiReleaseTagMixin,
	ApiReturnTypeMixin,
	Excerpt,
	Parameter,
	ReleaseTag,
	TypeParameter,
} from "@microsoft/api-extractor-model";

import {
	CodeSpanNode,
	DocumentationNode,
	HeadingNode,
	LinkNode,
	PlainTextNode,
	SectionNode,
	SpanNode,
	TableBodyCellNode,
	TableBodyRowNode,
	TableHeaderCellNode,
	TableHeaderRowNode,
	TableNode,
} from "../../documentation-domain";
import {
	ApiFunctionLike,
	ApiModifier,
	getDefaultValueBlock,
	getLinkForApiItem,
	getModifiers,
	isDeprecated,
} from "../ApiItemUtilities";
import { transformDocSection } from "../DocNodeTransforms";
import { getDocNodeTransformationOptions } from "../Utilities";
import { ApiItemTransformationConfiguration } from "../configuration";
import { createExcerptSpanWithHyperlinks } from "./Helpers";

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
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode[] | undefined {
	const sections: SectionNode[] = [];

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
	config: Required<ApiItemTransformationConfiguration>,
): SectionNode | undefined {
	const table = createSummaryTable(
		memberTableProperties.items,
		memberTableProperties.itemKind,
		config,
		memberTableProperties.options,
	);

	return table === undefined
		? undefined
		: new SectionNode(
				[table],
				HeadingNode.createFromPlainText(memberTableProperties.headingTitle),
		  );
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
	config: Required<ApiItemTransformationConfiguration>,
	options?: TableCreationOptions,
): TableNode | undefined {
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
		case ApiItemKind.MethodSignature:
			return createFunctionLikeSummaryTable(
				apiItems.map((apiItem) => apiItem as ApiFunctionLike),
				itemKind,
				config,
				options,
			);

		case ApiItemKind.Property:
		case ApiItemKind.PropertySignature:
			return createPropertiesTable(
				apiItems.map((apiItem) => apiItem as ApiPropertyItem),
				config,
				options,
			);

		case ApiItemKind.Package:
			return createPackagesTable(
				apiItems.map((apiItem) => apiItem as ApiPackage),
				config,
			);

		default:
			return createDefaultSummaryTable(apiItems, itemKind, config, options);
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
	config: Required<ApiItemTransformationConfiguration>,
	options?: TableCreationOptions,
): TableNode | undefined {
	if (apiItems.length === 0) {
		return undefined;
	}

	// Only display "Alerts" column if there are any deprecated items in the list.
	const hasDeprecated = apiItems.some((element) => isDeprecated(element));

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiItems.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText(getTableHeadingTitleForApiKind(itemKind)),
	];
	if (hasDeprecated) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Modifiers"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiItem of apiItems) {
		const bodyRowCells: TableBodyCellNode[] = [createApiTitleCell(apiItem, config)];
		if (hasDeprecated) {
			bodyRowCells.push(createDeprecatedCell(apiItem));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiItem, options?.modifiersToOmit));
		}
		bodyRowCells.push(createApiSummaryCell(apiItem, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableNode {
	// Only display "Modifiers" column if there are any optional parameters present.
	const hasOptionalParameters = apiParameters.some((apiParameter) => apiParameter.isOptional);

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText("Parameter"),
	];
	if (hasOptionalParameters) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Modifiers"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Type"));
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	function createModifierCell(apiParameter: Parameter): TableBodyCellNode {
		return apiParameter.isOptional
			? TableBodyCellNode.createFromPlainText("optional")
			: TableBodyCellNode.Empty;
	}

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiParameter of apiParameters) {
		const bodyRowCells: TableBodyCellNode[] = [createParameterTitleCell(apiParameter)];
		if (hasOptionalParameters) {
			bodyRowCells.push(createModifierCell(apiParameter));
		}
		bodyRowCells.push(createParameterTypeCell(apiParameter, config));
		bodyRowCells.push(createParameterSummaryCell(apiParameter, contextApiItem, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableNode {
	// Only display "Modifiers" column if there are any optional parameters present.
	const hasOptionalParameters = apiTypeParameters.some(
		(apiTypeParameter) => apiTypeParameter.isOptional,
	);

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText("Parameter"),
	];
	if (hasOptionalParameters) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Modifiers"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	function createModifierCell(apiParameter: TypeParameter): TableBodyCellNode {
		return apiParameter.isOptional
			? TableBodyCellNode.createFromPlainText("optional")
			: TableBodyCellNode.Empty;
	}

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiTypeParameter of apiTypeParameters) {
		const bodyRowCells: TableBodyCellNode[] = [
			TableBodyCellNode.createFromPlainText(apiTypeParameter.name),
		];
		if (hasOptionalParameters) {
			bodyRowCells.push(createModifierCell(apiTypeParameter));
		}
		bodyRowCells.push(createTypeParameterSummaryCell(apiTypeParameter, contextApiItem, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
	options?: TableCreationOptions,
): TableNode | undefined {
	if (apiItems.length === 0) {
		return undefined;
	}

	// Only display "Alerts" column if there are any deprecated items in the list.
	const hasDeprecated = apiItems.some((element) => isDeprecated(element));

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiItems.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);
	const hasReturnTypes = apiItems.some((apiItem) => ApiReturnTypeMixin.isBaseClassOf(apiItem));

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText(getTableHeadingTitleForApiKind(itemKind)),
	];
	if (hasDeprecated) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Modifiers"));
	}
	if (hasReturnTypes) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Return Type"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiItem of apiItems) {
		const bodyRowCells: TableBodyCellNode[] = [createApiTitleCell(apiItem, config)];
		if (hasDeprecated) {
			bodyRowCells.push(createDeprecatedCell(apiItem));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiItem, options?.modifiersToOmit));
		}
		if (hasReturnTypes) {
			bodyRowCells.push(createReturnTypeCell(apiItem, config));
		}
		bodyRowCells.push(createApiSummaryCell(apiItem, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
	options?: TableCreationOptions,
): TableNode | undefined {
	if (apiProperties.length === 0) {
		return undefined;
	}

	// Only display "Alerts" column if there are any deprecated items in the list.
	const hasDeprecated = apiProperties.some((element) => isDeprecated(element));

	// Only display "Modifiers" column if there are any modifiers to display.
	const hasModifiers = apiProperties.some(
		(apiItem) => getModifiers(apiItem, options?.modifiersToOmit).length > 0,
	);
	const hasDefaultValues = apiProperties.some(
		(apiItem) => getDefaultValueBlock(apiItem, config) !== undefined,
	);

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText("Property"),
	];
	if (hasDeprecated) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Alerts"));
	}
	if (hasModifiers) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Modifiers"));
	}
	if (hasDefaultValues) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Default Value"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Type"));
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiProperty of apiProperties) {
		const bodyRowCells: TableBodyCellNode[] = [createApiTitleCell(apiProperty, config)];
		if (hasDeprecated) {
			bodyRowCells.push(createDeprecatedCell(apiProperty));
		}
		if (hasModifiers) {
			bodyRowCells.push(createModifiersCell(apiProperty, options?.modifiersToOmit));
		}
		if (hasDefaultValues) {
			bodyRowCells.push(createDefaultValueCell(apiProperty, config));
		}
		bodyRowCells.push(createPropertyTypeCell(apiProperty, config));
		bodyRowCells.push(createApiSummaryCell(apiProperty, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableNode | undefined {
	if (apiPackages.length === 0) {
		return undefined;
	}

	// Only display "Alerts" column if there are any deprecated items in the list.
	const hasDeprecated = apiPackages.some((element) => isDeprecated(element));

	const headerRowCells: TableHeaderCellNode[] = [
		TableHeaderCellNode.createFromPlainText("Package"),
	];
	if (hasDeprecated) {
		headerRowCells.push(TableHeaderCellNode.createFromPlainText("Alerts"));
	}
	headerRowCells.push(TableHeaderCellNode.createFromPlainText("Description"));
	const headerRow = new TableHeaderRowNode(headerRowCells);

	const bodyRows: TableBodyRowNode[] = [];
	for (const apiPackage of apiPackages) {
		const bodyRowCells: TableBodyCellNode[] = [createApiTitleCell(apiPackage, config)];
		if (hasDeprecated) {
			bodyRowCells.push(createDeprecatedCell(apiPackage));
		}
		bodyRowCells.push(createApiSummaryCell(apiPackage, config));

		bodyRows.push(new TableBodyRowNode(bodyRowCells));
	}

	return new TableNode(bodyRows, headerRow);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	const contents: DocumentationNode[] = [];

	if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
		contents.push(
			new SpanNode([new PlainTextNode("(BETA)")], {
				bold: true,
				italic: true,
			}),
		);
	}

	if (apiItem instanceof ApiDocumentedItem) {
		const docNodeTransformOptions = getDocNodeTransformationOptions(apiItem, config);
		if (apiItem.tsdocComment !== undefined) {
			const summaryComment = transformDocSection(
				apiItem.tsdocComment.summarySection,
				docNodeTransformOptions,
			);
			contents.push(...summaryComment.children);
		}
	}

	return contents.length === 0 ? TableBodyCellNode.Empty : new TableBodyCellNode(contents);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	return ApiReturnTypeMixin.isBaseClassOf(apiItem)
		? createTypeExcerptCell(apiItem.returnTypeExcerpt, config)
		: TableBodyCellNode.Empty;
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	const itemLink = getLinkForApiItem(apiItem, config);
	return new TableBodyCellNode([LinkNode.createFromPlainTextLink(itemLink)]);
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
): TableBodyCellNode {
	const modifiers = getModifiers(apiItem, modifiersToOmit);

	const contents: DocumentationNode[] = [];
	let needsComma = false;
	for (const modifier of modifiers) {
		if (needsComma) {
			contents.push(new PlainTextNode(", "));
		}
		contents.push(CodeSpanNode.createFromPlainText(modifier));
		needsComma = true;
	}

	return modifiers.length === 0 ? TableBodyCellNode.Empty : new TableBodyCellNode(contents);
}

/**
 * Creates a table cell containing the `@defaultValue` comment of the API item if it has one.
 *
 * @param apiItem - The API item whose `@defaultValue` comment will be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createDefaultValueCell(
	apiItem: ApiItem,
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	const docNodeTransformOptions = getDocNodeTransformationOptions(apiItem, config);

	const defaultValueSection = getDefaultValueBlock(apiItem, config);

	if (defaultValueSection === undefined) {
		return TableBodyCellNode.Empty;
	}

	const contents = transformDocSection(defaultValueSection, docNodeTransformOptions);

	// Since we are sticking the contents into a table cell, we can remove the outer Paragraph node
	// from the hierarchy to simplify things.
	return new TableBodyCellNode(contents.children);
}

/**
 * Creates a table cell noting that the item is deprecated if it is annotated with an `@deprecated` comment.
 * Will use an empty table cell otherwise.
 *
 * @param apiItem - The API item for which the deprecation notice will be displayed if appropriate.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createDeprecatedCell(apiItem: ApiItem): TableBodyCellNode {
	return isDeprecated(apiItem)
		? new TableBodyCellNode([CodeSpanNode.createFromPlainText("DEPRECATED")])
		: TableBodyCellNode.Empty;
}

/**
 * Creates a table cell containing the type information about the provided property.
 *
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param apiProperty - The property whose type information will be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createPropertyTypeCell(
	apiProperty: ApiPropertyItem,
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	return createTypeExcerptCell(apiProperty.propertyTypeExcerpt, config);
}

/**
 * Creates a table cell containing the name of the provided parameter as plain text.
 *
 * @param apiParameter - The parameter whose name will be displayed in the cell.
 */
export function createParameterTitleCell(apiParameter: Parameter): TableBodyCellNode {
	return TableBodyCellNode.createFromPlainText(apiParameter.name);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	if (apiParameter.tsdocParamBlock === undefined) {
		return TableBodyCellNode.Empty;
	}

	const docNodeTransformOptions = getDocNodeTransformationOptions(contextApiItem, config);

	const cellContent = transformDocSection(
		apiParameter.tsdocParamBlock.content,
		docNodeTransformOptions,
	);

	// Since we are putting the contents into a table cell anyways, omit the Paragraph
	// node from the hierarchy to simplify it.
	return new TableBodyCellNode(cellContent.children);
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
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	if (apiTypeParameter.tsdocTypeParamBlock === undefined) {
		return TableBodyCellNode.Empty;
	}

	const docNodeTransformOptions = getDocNodeTransformationOptions(contextApiItem, config);

	const cellContent = transformDocSection(
		apiTypeParameter.tsdocTypeParamBlock.content,
		docNodeTransformOptions,
	);

	// Since we are putting the contents into a table cell anyways, omit the Paragraph
	// node from the hierarchy to simplify it.
	return new TableBodyCellNode(cellContent.children);
}

/**
 * Creates a table cell containing type information.
 * @remarks This content will be generated as links to type signature documentation for other items local to the same
 * API suite (model).
 *
 * @param typeExcerpty - An excerpt describing the type to be displayed in the cell.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function createTypeExcerptCell(
	typeExcerpt: Excerpt,
	config: Required<ApiItemTransformationConfiguration>,
): TableBodyCellNode {
	const excerptSpan = createExcerptSpanWithHyperlinks(typeExcerpt, config);
	return excerptSpan === undefined
		? TableBodyCellNode.Empty
		: new TableBodyCellNode([excerptSpan]);
}

/**
 * Gets the appropriate heading title for the provided item kind to be used in table entries.
 */
function getTableHeadingTitleForApiKind(itemKind: ApiItemKind): string {
	switch (itemKind) {
		case ApiItemKind.EnumMember:
			return "Flag";
		case ApiItemKind.MethodSignature:
			return ApiItemKind.Method;
		case ApiItemKind.PropertySignature:
			return ApiItemKind.Property;
		default:
			return itemKind;
	}
}
