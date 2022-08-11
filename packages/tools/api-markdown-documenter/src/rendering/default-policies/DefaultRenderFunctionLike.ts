import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiFunctionLike } from "../../utilities";
import { renderParametersSection } from "../Rendering";

export function renderFunctionLikeSection(
    apiFunctionLike: ApiFunctionLike,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render parameter table (if any parameters)
    const renderedParameterTable = renderParametersSection(
        apiFunctionLike,
        documenterConfiguration,
        tsdocConfiguration,
    );
    if (renderedParameterTable !== undefined) {
        docNodes.push(renderedParameterTable);
    }

    const innerSectionBody = new DocSection({ configuration: tsdocConfiguration }, docNodes);

    return documenterConfiguration.renderSectionBlock(
        apiFunctionLike,
        innerSectionBody,
        documenterConfiguration,
        tsdocConfiguration,
    );
}
