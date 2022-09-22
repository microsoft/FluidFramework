import { ApiPackage } from "@microsoft/api-extractor-model";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { DocumentNode, HierarchicalSectionNode } from "../documentation-domain";
import { apiItemToSection } from "./TransformApiItem";
import { createDocument } from "./Utilities";
import { createBreadcrumbParagraph, wrapInSection } from "./helpers";

/**
 * Creates a {@link DocumentNode} for the specified `apiPackage`.
 *
 * @param apiPackage - The package content to be rendered.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 *
 * @returns The rendered Markdown document.
 */
export function apiPackageToDocument(
    apiPackage: ApiPackage,
    config: Required<MarkdownDocumenterConfiguration>,
): DocumentNode {
    const logger = config.logger;

    logger.verbose(`Rendering ${apiPackage.name} package document...`);

    const sections: HierarchicalSectionNode[] = [];

    // Render breadcrumb
    sections.push(wrapInSection([createBreadcrumbParagraph(apiPackage, config)], undefined));

    // Render body contents
    sections.push(
        config.transformApiPackage(apiPackage, config, (childItem) =>
            apiItemToSection(childItem, config),
        ),
    );

    logger.verbose(`Package document rendered successfully.`);

    return createDocument(apiPackage, sections, config);
}
