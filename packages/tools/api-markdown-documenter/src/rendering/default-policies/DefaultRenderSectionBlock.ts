import { ApiItem, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import { DocNode, DocSection, TSDocConfiguration } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { doesItemRequireOwnDocument } from "../../utilities";
import {
    renderBetaWarning,
    renderDeprecationNotice,
    renderExamples,
    renderHeading,
    renderRemarks,
    renderSignature,
    renderSummary,
} from "../Rendering";

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
 * 1. TODO: what else?
 *
 * 1. `innerSectionBody`
 *
 * 1.TODO: what else?
 *
 * @param apiItem - TODO
 * @param innerSectionBody - TODO
 * @param documenterConfiguration - TODO
 * @param tsdocConfiguration - TODO
 * @returns TODO
 */
export function renderSectionBlock(
    apiItem: ApiItem,
    innerSectionBody: DocSection | undefined,
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

    // Render deprecation notice (if any)
    const renderedDeprecationNotice = renderDeprecationNotice(apiItem, tsdocConfiguration);
    if (renderedDeprecationNotice !== undefined) {
        docNodes.push(renderedDeprecationNotice);
    }

    // Render summary comment (if any)
    const renderedSummary = renderSummary(apiItem);
    if (renderedSummary !== undefined) {
        docNodes.push(renderedSummary);
    }

    // Render @remarks content (if any)
    const renderedRemarks = renderRemarks(apiItem, tsdocConfiguration);
    if (renderedRemarks !== undefined) {
        docNodes.push(renderedRemarks);
    }

    // Render examples (if any)
    const renderedExamples = renderExamples(apiItem, tsdocConfiguration);
    if (renderedExamples !== undefined) {
        docNodes.push(renderedExamples);
    }

    // Render signature
    const renderedSignature = renderSignature(apiItem, documenterConfiguration, tsdocConfiguration);
    if (renderedSignature !== undefined) {
        docNodes.push(renderedSignature);
    }

    // TODO: anything else before inner body?

    if (innerSectionBody !== undefined) {
        docNodes.push(innerSectionBody);
    }

    // TODO: anything after inner body?

    return new DocSection({ configuration: tsdocConfiguration }, docNodes);
}
