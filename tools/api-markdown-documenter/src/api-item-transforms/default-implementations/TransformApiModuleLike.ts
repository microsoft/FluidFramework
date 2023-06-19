/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	ApiClass,
	ApiEnum,
	ApiFunction,
	ApiInterface,
	ApiItem,
	ApiItemKind,
	ApiNamespace,
	ApiTypeAlias,
	ApiVariable,
} from "@microsoft/api-extractor-model";

import { SectionNode } from "../../documentation-domain";
import { ApiModuleLike, filterByKind } from "../ApiItemUtilities";
import { ApiItemTransformationConfiguration } from "../configuration";
import { createChildDetailsSection, createMemberTables } from "../helpers";

/**
 * Default documentation transform for module-like API items (packages, namespaces).
 *
 * @remarks Format:
 *
 * Tables
 *
 * - interfaces
 *
 * - classes
 *
 * - enums
 *
 * - type-aliases
 *
 * - functions
 *
 * - variables
 *
 * - namespaces
 *
 * Details (for any types not rendered to their own documents - see {@link DocumentationSuiteOptions.documentBoundaries})
 *
 * - interfaces
 *
 * - classes
 *
 * - enums
 *
 * - type-aliases
 *
 * - functions
 *
 * - variables
 *
 * - namespaces
 */
export function transformApiModuleLike(
	apiItem: ApiModuleLike,
	childItems: readonly ApiItem[],
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const children: SectionNode[] = [];

	const hasAnyChildren = childItems.length > 0;

	if (hasAnyChildren) {
		// Accumulate child items
		const interfaces = filterByKind(childItems, [ApiItemKind.Interface]).map(
			(_apiItem) => _apiItem as ApiInterface,
		);

		const classes = filterByKind(childItems, [ApiItemKind.Class]).map(
			(_apiItem) => _apiItem as ApiClass,
		);

		const namespaces = filterByKind(childItems, [ApiItemKind.Namespace]).map(
			(_apiItem) => _apiItem as ApiNamespace,
		);

		const types = filterByKind(childItems, [ApiItemKind.TypeAlias]).map(
			(_apiItem) => _apiItem as ApiTypeAlias,
		);

		const functions = filterByKind(childItems, [ApiItemKind.Function]).map(
			(_apiItem) => _apiItem as ApiFunction,
		);

		const enums = filterByKind(childItems, [ApiItemKind.Enum]).map(
			(_apiItem) => _apiItem as ApiEnum,
		);

		const variables = filterByKind(childItems, [ApiItemKind.Variable]).map(
			(_apiItem) => _apiItem as ApiVariable,
		);

		// Render summary tables
		const memberTableSections = createMemberTables(
			[
				{
					headingTitle: "Interfaces",
					itemKind: ApiItemKind.Interface,
					items: interfaces,
				},
				{
					headingTitle: "Classes",
					itemKind: ApiItemKind.Class,
					items: classes,
				},
				{
					headingTitle: "Enumerations",
					itemKind: ApiItemKind.Enum,
					items: enums,
				},
				{
					headingTitle: "Types",
					itemKind: ApiItemKind.TypeAlias,
					items: types,
				},
				{
					headingTitle: "Functions",
					itemKind: ApiItemKind.Function,
					items: functions,
				},
				{
					headingTitle: "Variables",
					itemKind: ApiItemKind.Variable,
					items: variables,
				},
				{
					headingTitle: "Namespaces",
					itemKind: ApiItemKind.Namespace,
					items: namespaces,
				},
			],
			config,
		);

		if (memberTableSections !== undefined) {
			children.push(...memberTableSections);
		}

		// Render child item details if there are any that will not be rendered to their own documents
		const detailsSections = createChildDetailsSection(
			[
				{
					heading: { title: "Interface Details" },
					itemKind: ApiItemKind.Interface,
					items: interfaces,
				},
				{
					heading: { title: "Class Details" },
					itemKind: ApiItemKind.Class,
					items: classes,
				},
				{
					heading: { title: "Enumeration Details" },
					itemKind: ApiItemKind.Enum,
					items: enums,
				},
				{
					heading: { title: "Type Details" },
					itemKind: ApiItemKind.TypeAlias,
					items: types,
				},
				{
					heading: { title: "Function Details" },
					itemKind: ApiItemKind.Function,
					items: functions,
				},
				{
					heading: { title: "Variable Details" },
					itemKind: ApiItemKind.Variable,
					items: variables,
				},
				{
					heading: { title: "Namespace Details" },
					itemKind: ApiItemKind.Namespace,
					items: namespaces,
				},
			],
			config,
			generateChildContent,
		);

		if (detailsSections !== undefined) {
			children.push(...detailsSections);
		}
	}

	return config.createChildContentSections(apiItem, children, config);
}
