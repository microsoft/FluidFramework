import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { DocNode, DocParagraph, DocPlainText, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan } from "../../doc-nodes";
import { renderTableWithHeading } from "../helpers";

export function renderModelSection(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
) {
    const docNodes: DocNode[] = [];

    if (apiModel.packages.length === 0) {
        // If no packages under model, print simple note.
        docNodes.push(
            new DocParagraph({ configuration: config.tsdocConfiguration }, [
                new DocEmphasisSpan({ configuration: config.tsdocConfiguration, italic: true }, [
                    new DocPlainText({
                        configuration: config.tsdocConfiguration,
                        text: "No packages discovered while parsing model.",
                    }),
                ]),
            ]),
        );
    } else {
        // Render packages table
        const packagesTable = renderTableWithHeading(
            {
                headingTitle: "Packages",
                itemKind: ApiItemKind.Package,
                items: apiModel.packages,
            },
            config,
        );

        if (packagesTable === undefined) {
            throw new Error("No packages table rendered for non-empty list of packages.");
        }

        docNodes.push(packagesTable);
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}
