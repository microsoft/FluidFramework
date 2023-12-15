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

import { type DocumentationNode, type SectionNode } from "../../documentation-domain";
import { filterByKind } from "../../utilities";
import { type ApiItemTransformationConfiguration } from "../configuration";
import { createMemberTables, wrapInSection } from "../helpers";
import { filterChildMembers } from "../ApiItemTransformUtilities";

/**
 * Default documentation transform for `Enum` items.
 */
export function transformApiEnum(
	apiEnum: ApiEnum,
	config: Required<ApiItemTransformationConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const sections: SectionNode[] = [];

	const filteredChildren = filterChildMembers(apiEnum, config);
	if (filteredChildren.length > 0) {
		// Accumulate child items
		const flags = filterByKind(apiEnum.members, [ApiItemKind.EnumMember]).map(
			(apiItem) => apiItem as ApiEnumMember,
		);

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

	return config.createDefaultLayout(apiEnum, sections, config);
}
