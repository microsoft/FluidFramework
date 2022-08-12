import { ApiEnum, ApiEnumMember, ApiItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { filterByKind } from "../../utilities";
import { renderChildDetailsSection } from "../Rendering";
import { renderMemberTables } from "../Tables";

export function renderEnumSection(
    apiEnum: ApiEnum,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
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
            documenterConfiguration,
            tsdocConfiguration,
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
            documenterConfiguration,
            tsdocConfiguration,
            renderChild,
        );

        if (renderedDetailsSection !== undefined) {
            docNodes.push(renderedDetailsSection);
        }
    }

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiEnum,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
