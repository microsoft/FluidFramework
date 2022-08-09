import { DocEmphasisSpan } from "@microsoft/api-documenter/lib/nodes/DocEmphasisSpan";
import { DocHeading } from "@microsoft/api-documenter/lib/nodes/DocHeading";
import { DocTable } from "@microsoft/api-documenter/lib/nodes/DocTable";
import { DocTableRow } from "@microsoft/api-documenter/lib/nodes/DocTableRow";
import {
    ApiConstructSignature,
    ApiConstructor,
    ApiFunction,
    ApiItem,
    ApiMethod,
    ApiMethodSignature,
    ApiModel,
    ApiPackage,
} from "@microsoft/api-extractor-model";
import {
    DocNode,
    DocParagraph,
    DocPlainText,
    DocSection,
    TSDocConfiguration,
} from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "./MarkdownDocumenterConfiguration";
import { renderSummaryCell, renderTitleCell } from "./Rendering";

export type RenderingPolicy<TApiItem extends ApiItem> = (
    apiItem: TApiItem,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
) => DocSection;

/**
 * TODO
 * Qs:
 * - Do these include headings? I think no.
 */
export interface RenderingPolicies {
    renderConstructor?: RenderingPolicy<ApiConstructSignature | ApiConstructor>;
    renderFunction?: RenderingPolicy<ApiFunction>;
    renderMethod?: RenderingPolicy<ApiMethod | ApiMethodSignature>;
    renderModel?: RenderingPolicy<ApiModel>;
    renderPackage?: RenderingPolicy<ApiPackage>;
}

export namespace DefaultRenderingPolicies {
    export function defaultRenderModel(
        apiModel: ApiModel,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ) {
        const docNodes: DocNode[] = [];

        if (apiModel.packages.length === 0) {
            // If no packages under model, print simple note.
            docNodes.push(
                new DocParagraph({ configuration: tsdocConfiguration }, [
                    new DocEmphasisSpan({ configuration: tsdocConfiguration, italic: true }, [
                        new DocPlainText({
                            configuration: tsdocConfiguration,
                            text: "No packages discovered while parsing model.",
                        }),
                    ]),
                ]),
            );
        } else {
            const packagesTable: DocTable = new DocTable({
                configuration: tsdocConfiguration,
                headerTitles: ["Package", "Description"],
                // cssClass: 'package-list',
                // caption: 'List of packages in this model'
            });

            for (const apiPackage of apiModel.packages) {
                packagesTable.addRow(
                    new DocTableRow({ configuration: tsdocConfiguration }, [
                        renderTitleCell(apiPackage, documenterConfiguration, tsdocConfiguration),
                        renderSummaryCell(apiPackage, tsdocConfiguration),
                    ]),
                );
            }

            docNodes.push(new DocHeading({ configuration: tsdocConfiguration, title: "Packages" }));
            docNodes.push(packagesTable);
        }

        return new DocSection({ configuration: tsdocConfiguration }, docNodes);
    }

    export function defaultRenderPackage(
        apiPackage: ApiPackage,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return new DocSection({ configuration: tsdocConfiguration }, [
            new DocParagraph({ configuration: tsdocConfiguration }, [
                new DocPlainText({
                    configuration: tsdocConfiguration,
                    text: "TODO: package rendering",
                }),
            ]),
        ]);
    }

    export function defaultRenderFunctionLike(
        apiItem:
            | ApiConstructor
            | ApiConstructSignature
            | ApiFunction
            | ApiMethod
            | ApiMethodSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        const docNodes: DocNode[] = [];
        // Render parameter table
        // TODO
        // TODO: what else?
        return new DocSection({ configuration: tsdocConfiguration }, docNodes);
    }

    export function defaultRenderConstructor(
        apiItem: ApiConstructor | ApiConstructSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }

    export function defaultRenderFunction(
        apiItem: ApiFunction,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }

    export function defaultRenderMethod(
        apiItem: ApiMethod | ApiMethodSignature,
        documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
        tsdocConfiguration: TSDocConfiguration,
    ): DocSection {
        return defaultRenderFunctionLike(apiItem, documenterConfiguration, tsdocConfiguration);
    }
}

export const defaultRenderingPolicies: Required<RenderingPolicies> = {
    renderConstructor: DefaultRenderingPolicies.defaultRenderConstructor,
    renderFunction: DefaultRenderingPolicies.defaultRenderFunction,
    renderMethod: DefaultRenderingPolicies.defaultRenderMethod,
    renderModel: DefaultRenderingPolicies.defaultRenderModel,
    renderPackage: DefaultRenderingPolicies.defaultRenderPackage,
};
