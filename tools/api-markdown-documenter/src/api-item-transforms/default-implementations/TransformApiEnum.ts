/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiEnum, ApiEnumMember, ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { DocumentationNode, SectionNode } from "../../documentation-domain";
import { filterByKind } from "../../utilities";
import { createMemberTables, wrapInSection } from "../helpers";

/**
 * Default policy for rendering doc sections for `Enum` items.
 */
export function transformApiEnum(
	apiEnum: ApiEnum,
	config: Required<MarkdownDocumenterConfiguration>,
	generateChildContent: (apiItem: ApiItem) => SectionNode[],
): SectionNode[] {
	const sections: SectionNode[] = [];

	const hasAnyChildren = apiEnum.members.length > 0;

	if (hasAnyChildren) {
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

	return config.createChildContentSections(apiEnum, sections, config);
}
