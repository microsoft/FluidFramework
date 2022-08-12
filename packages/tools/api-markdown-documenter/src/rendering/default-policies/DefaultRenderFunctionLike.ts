import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiFunctionLike } from "../../utilities";
import { renderParametersSection } from "../RenderingHelpers";

export function renderFunctionLikeSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render parameter table (if any parameters)
    const renderedParameterTable = renderParametersSection(apiFunctionLike, config);
    if (renderedParameterTable !== undefined) {
        docNodes.push(renderedParameterTable);
    }

    const innerSectionBody = new DocSection({ configuration: config.tsdocConfiguration }, docNodes);

    return config.renderSectionBlock(apiFunctionLike, innerSectionBody, config);
}
