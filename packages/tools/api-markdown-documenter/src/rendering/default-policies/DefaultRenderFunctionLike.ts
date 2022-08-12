import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiFunctionLike } from "../../utilities";
import { renderParametersSection } from "../helpers";

export function renderFunctionLikeSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // Render parameter table (if any parameters)
    const renderedParameterTable = renderParametersSection(apiFunctionLike, config);

    return config.renderSectionBlock(apiFunctionLike, renderedParameterTable, config);
}
