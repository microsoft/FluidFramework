import { ApiItem, ApiModel } from "@microsoft/api-extractor-model";
import { DocNode, DocParagraph, DocPlainText, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { DocEmphasisSpan, DocTable, DocTableRow } from "../../doc-nodes";
import { renderHeading } from "../Rendering";
import { renderApiSummaryCell, renderApiTitleCell } from "../Tables";

// TODOs:
// - Reuse child table / contents rendering utilities

export function renderModelSection(
    apiModel: ApiModel,
    config: Required<MarkdownDocumenterConfiguration>,
    renderChild: (apiItem: ApiItem) => DocSection,
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
        const packagesTable: DocTable = new DocTable({
            configuration: config.tsdocConfiguration,
            headerTitles: ["Package", "Description"],
            // TODO
            // cssClass: 'package-list',
            // caption: 'List of packages in this model'
        });

        for (const apiPackage of apiModel.packages) {
            packagesTable.addRow(
                new DocTableRow({ configuration: config.tsdocConfiguration }, [
                    renderApiTitleCell(apiPackage, config),
                    renderApiSummaryCell(apiPackage, config),
                ]),
            );
        }

        docNodes.push(renderHeading({ title: "Packages" }, config));

        // TODO: table caption?

        docNodes.push(packagesTable);
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}
