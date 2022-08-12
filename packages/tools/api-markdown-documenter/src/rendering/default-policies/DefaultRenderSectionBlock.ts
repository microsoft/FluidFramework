import { ApiItem, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import { DocNode, DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { doesItemRequireOwnDocument } from "../../utilities";
import {
    renderBetaWarning,
    renderDeprecationNotice,
    renderExamples,
    renderHeadingForApiItem,
    renderRemarks,
    renderSignature,
    renderSummary,
} from "../helpers";

/**
 * Default rendering format for API item sections.
 * Wraps the item-kind-specific details in the following manner:
 *
 * 1. Heading (if not the document-root item)
 * 1. Beta warning (if item annotated with `@beta`)
 * 1. Deprecation notice (if any)
 * 1. Summary (if any)
 * 1. Remarks (if any)
 * 1. Examples (if any)
 * 1. Item Signature
 * 1. `innerSectionBody`
 *
 * @param apiItem - TODO
 * @param innerSectionBody - TODO
 * @param config - TODO
 * @param tsdocConfiguration - TODO
 * @returns TODO
 */
export function renderSectionBlock(
    apiItem: ApiItem,
    innerSectionBody: DocSection | undefined,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const docNodes: DocNode[] = [];

    // Render heading for non-document-items only.
    // Document items have their headings handled specially.
    if (!doesItemRequireOwnDocument(apiItem, config.documentBoundaries)) {
        docNodes.push(renderHeadingForApiItem(apiItem, config));
    }

    // Render beta warning if applicable
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
        docNodes.push(renderBetaWarning(config));
    }

    // Render deprecation notice (if any)
    const renderedDeprecationNotice = renderDeprecationNotice(apiItem, config);
    if (renderedDeprecationNotice !== undefined) {
        docNodes.push(renderedDeprecationNotice);
    }

    // Render summary comment (if any)
    const renderedSummary = renderSummary(apiItem);
    if (renderedSummary !== undefined) {
        docNodes.push(renderedSummary);
    }

    // Render @remarks content (if any)
    const renderedRemarks = renderRemarks(apiItem, config);
    if (renderedRemarks !== undefined) {
        docNodes.push(renderedRemarks);
    }

    // Render examples (if any)
    const renderedExamples = renderExamples(apiItem, config);
    if (renderedExamples !== undefined) {
        docNodes.push(renderedExamples);
    }

    // Render signature
    const renderedSignature = renderSignature(apiItem, config);
    if (renderedSignature !== undefined) {
        docNodes.push(renderedSignature);
    }

    if (innerSectionBody !== undefined) {
        // Flatten contents into this section
        docNodes.push(...innerSectionBody.nodes);
    }

    return new DocSection({ configuration: config.tsdocConfiguration }, docNodes);
}
