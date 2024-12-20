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

import type { SectionNode } from "../../documentation-domain/index.js";
import type { ApiModuleLike } from "../../utilities/index.js";
import { getScopedMemberNameForDiagnostics } from "../../utilities/index.js";
import { filterItems } from "../ApiItemTransformUtilities.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createChildDetailsSection, createMemberTables } from "../helpers/index.js";

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
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const children: SectionNode[] = [];

	const filteredChildren = filterItems(apiItem.members, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const interfaces: ApiInterface[] = [];
		const classes: ApiClass[] = [];
		const namespaces: ApiNamespace[] = [];
		const types: ApiTypeAlias[] = [];
		const functions: ApiFunction[] = [];
		const enums: ApiEnum[] = [];
		const variables: ApiVariable[] = [];
		for (const child of filteredChildren) {
			switch (child.kind) {
				case ApiItemKind.Interface: {
					interfaces.push(child as ApiInterface);
					break;
				}
				case ApiItemKind.Class: {
					classes.push(child as ApiClass);
					break;
				}
				case ApiItemKind.Namespace: {
					namespaces.push(child as ApiNamespace);
					break;
				}
				case ApiItemKind.TypeAlias: {
					types.push(child as ApiTypeAlias);
					break;
				}
				case ApiItemKind.Function: {
					functions.push(child as ApiFunction);
					break;
				}
				case ApiItemKind.Enum: {
					enums.push(child as ApiEnum);
					break;
				}
				case ApiItemKind.Variable: {
					variables.push(child as ApiVariable);
					break;
				}
				default: {
					config.logger?.error(
						`Child item "${child.displayName}" of ${
							apiItem.kind
						} "${getScopedMemberNameForDiagnostics(
							apiItem,
						)}" is of unsupported API item kind: "${child.kind}"`,
					);
					break;
				}
			}
		}

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

	return config.transformations.createDefaultLayout(apiItem, children, config);
}
