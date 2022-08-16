/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiFunctionLike } from "../../utilities";
import { renderParametersSection } from "../helpers";

/**
 * Default policy for rendering doc sections for function-like API items
 * (constructors, functions, methods).
 */
export function renderFunctionLikeSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    // Render parameter table (if any parameters)
    const renderedParameterTable = renderParametersSection(apiFunctionLike, config);

    return config.renderChildrenSection(apiFunctionLike, renderedParameterTable, config);
}
