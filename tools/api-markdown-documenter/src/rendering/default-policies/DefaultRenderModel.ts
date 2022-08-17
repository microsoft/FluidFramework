/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { DocParagraph, DocPlainText, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan } from "../../doc-nodes";
import { renderTableWithHeading } from "../helpers";

/**
 * Default policy for rendering doc sections for `Model` items.
 */
export function renderModelSection(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    if (apiModel.packages.length === 0) {
        // If no packages under model, print simple note.
        return new DocSection({ configuration: config.tsdocConfiguration }, [
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, italic: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: "No packages discovered while parsing model.",
                    }),
                ]),
            ]),
        ]);
    }
    // Render packages table
    const packagesTableSection = renderTableWithHeading(
        {
            headingTitle: "Packages",
            itemKind: ApiItemKind.Package,
            items: apiModel.packages,
        },
        config,
    );

    if (packagesTableSection === undefined) {
        throw new Error(
            "No table rendered for non-empty package list. This indicates an internal error.",
        );
    }

    return packagesTableSection;
}
