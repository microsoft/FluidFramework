/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { ApiFunctionLike, mergeSections } from "../../utilities";
import { renderParametersSection, renderReturnsSection } from "../helpers";

/**
 * Default policy for rendering doc sections for function-like API items
 * (constructors, functions, methods).
 */
export function renderFunctionLikeSection(
    apiFunctionLike: ApiFunctionLike,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const docSections: DocSection[] = [];

    // Render parameter table (if any parameters)
    const renderedParameterTable = renderParametersSection(apiFunctionLike, config);
    if (renderedParameterTable !== undefined) {
        docSections.push(renderedParameterTable);
    }

    // Render `@returns` block (if any)
    const renderedReturnsSection = renderReturnsSection(apiFunctionLike, config);
    if (renderedReturnsSection !== undefined) {
        docSections.push(renderedReturnsSection);
    }

    // Merge sections to reduce and simplify hierarchy
    const innerSectionBody = mergeSections(docSections, config.tsdocConfiguration);

    return config.renderChildrenSection(apiFunctionLike, innerSectionBody, config);
}
