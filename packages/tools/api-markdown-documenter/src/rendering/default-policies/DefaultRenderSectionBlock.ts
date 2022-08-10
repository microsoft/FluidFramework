import { ApiItem, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { doesItemRequireOwnDocument } from "../../utilities";
import { renderBetaWarning, renderHeading } from "../Rendering";

/**
 * Default rendering format for API item sections.
 * Wraps the item-kind-specific details in the following manner:
 *
 * 1. Heading (if not the document-root item)
 * 1. Beta warning (if item annotated with `@beta`)
 * 1. Deprecation notice (if any)
 * 1. Summary (if any)
 * 1. Item Signature
 * 1. Remarks (if any)
 * 1. Examples (if any)
 *
 * 1. `innerSectionBody`
 *
 * 1.
 *
 * @param apiItem
 * @param innerSectionBody
 * @param documenterConfiguration
 * @param tsdocConfiguration
 * @returns
 */
export function renderSectionBlock(
    apiItem: ApiItem,
    innerSectionBody: DocSection,
    documenterConfiguration: Required<MarkdownDocumenterConfiguration>,
    tsdocConfiguration: TSDocConfiguration,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render heading for non-document-items only.
    // Document items have their headings handled specially.
    if (!doesItemRequireOwnDocument(apiItem, documenterConfiguration.documentBoundaries)) {
        docNodes.push(renderHeading(apiItem, documenterConfiguration, tsdocConfiguration));
    }

    // Render beta warning if applicable
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
        docNodes.push(renderBetaWarning(tsdocConfiguration));
    }

    // TODO: anything else before inner body?

    docNodes.push(innerSectionBody);

    // TODO: anything after inner body?

    return new DocSection({ configuration: tsdocConfiguration }, docNodes);
}
