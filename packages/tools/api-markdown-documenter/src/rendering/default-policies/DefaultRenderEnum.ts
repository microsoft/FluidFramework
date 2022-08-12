import { ApiEnum, ApiEnumMember, ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { filterByKind } from "../../utilities";
import { renderChildDetailsSection } from "../RenderingHelpers";
import { renderMemberTables } from "../Tables";

export function renderEnumSection(
    apiEnum: ApiEnum,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
): DocSection {
    const docNodes: DocNode[] = [];

    const hasAnyChildren = apiEnum.members.length !== 0;

    if (hasAnyChildren) {
        // Accumulate child items
        const flags = filterByKind(apiEnum.members, [ApiItemKind.EnumMember]).map(
            (apiItem) => apiItem as ApiEnumMember,
        );

        // Render summary tables
        const renderedMemberTables = renderMemberTables(
            [
                {
                    headingTitle: "Flags",
                    itemKind: ApiItemKind.EnumMember,
                    items: flags,
                },
            ],
            config,
        );

        if (renderedMemberTables !== undefined) {
            docNodes.push(renderedMemberTables);
        }

        // Render child item details if there are any that will not be rendered to their own documents
        const renderedDetailsSection = renderChildDetailsSection(
            [
                {
                    headingTitle: "Flag Details",
                    itemKind: ApiItemKind.EnumMember,
                    items: flags,
                },
            ],
            config,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docNodes.push(renderedDetailsSection);
        }
    }

    const innerSectionBody = new DocSection({ configuration: config.tsdocConfiguration }, docNodes);

    return config.renderSectionBlock(apiEnum, innerSectionBody, config);
}
