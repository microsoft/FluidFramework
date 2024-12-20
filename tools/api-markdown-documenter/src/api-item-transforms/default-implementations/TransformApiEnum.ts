/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiEnum,
	type ApiEnumMember,
	type ApiItem,
	ApiItemKind,
} from "@microsoft/api-extractor-model";

import type { DocumentationNode, SectionNode } from "../../documentation-domain/index.js";
import { getScopedMemberNameForDiagnostics } from "../../utilities/index.js";
import { filterChildMembers } from "../ApiItemTransformUtilities.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";
import { createMemberTables, wrapInSection } from "../helpers/index.js";

/**
 * Default documentation transform for `Enum` items.
 */
export function transformApiEnum(
	apiEnum: ApiEnum,
	config: ApiItemTransformationConfiguration,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const sections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiEnum, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const flags: ApiEnumMember[] = [];
		for (const child of filteredChildren) {
			switch (child.kind) {
				case ApiItemKind.EnumMember: {
					flags.push(child as ApiEnumMember);
					break;
				}
				default: {
					config.logger?.error(
						`Child item "${
							child.displayName
						}" of Enum "${getScopedMemberNameForDiagnostics(
							apiEnum,
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
					headingTitle: "Flags",
					itemKind: ApiItemKind.EnumMember,
					items: flags,
				},
			],
			config,
		);
		if (memberTableSections !== undefined) {
			sections.push(...memberTableSections);
		}

		// Render individual flag details
		if (flags.length > 0) {
			const detailsSubSections: DocumentationNode[] = [];
			for (const flag of flags) {
				detailsSubSections.push(...generateChildContent(flag));
			}
			const detailsSection = wrapInSection(detailsSubSections);
			sections.push(detailsSection);
		}
	}

	return config.transformations.createDefaultLayout(apiEnum, sections, config);
}
