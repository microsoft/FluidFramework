/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type ApiClass,
	type ApiEnum,
	type ApiFunction,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	type ApiNamespace,
	type ApiTypeAlias,
	type ApiVariable,
} from "@microsoft/api-extractor-model";

import { type SectionNode } from "../../documentation-domain";
import { type ApiModuleLike, filterByKind } from "../../utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createChildDetailsSection, createMemberTables } from "../helpers";
import { filterItems } from "../ApiItemTransformUtilities";

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
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const children: SectionNode[] = [];

	const filteredChildren = filterItems(apiItem.members, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const interfaces = filterByKind(filteredChildren, [ApiItemKind.Interface]).map(
			(_apiItem) => _apiItem as ApiInterface,
		);

		const classes = filterByKind(filteredChildren, [ApiItemKind.Class]).map(
			(_apiItem) => _apiItem as ApiClass,
		);

		const namespaces = filterByKind(filteredChildren, [ApiItemKind.Namespace]).map(
			(_apiItem) => _apiItem as ApiNamespace,
		);

		const types = filterByKind(filteredChildren, [ApiItemKind.TypeAlias]).map(
			(_apiItem) => _apiItem as ApiTypeAlias,
		);

		const functions = filterByKind(filteredChildren, [ApiItemKind.Function]).map(
			(_apiItem) => _apiItem as ApiFunction,
		);

		const enums = filterByKind(filteredChildren, [ApiItemKind.Enum]).map(
			(_apiItem) => _apiItem as ApiEnum,
		);

		const variables = filterByKind(filteredChildren, [ApiItemKind.Variable]).map(
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

	return config.createDefaultLayout(apiItem, children, config);
}
