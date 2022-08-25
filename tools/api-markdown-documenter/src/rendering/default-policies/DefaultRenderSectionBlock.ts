/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../MarkdownDocumenterConfiguration";
import { doesItemRequireOwnDocument, mergeSections } from "../../utilities";
import {
    renderBetaWarning,
    renderDeprecationNoticeSection,
    renderExamplesSection,
    renderHeadingForApiItem,
    renderRemarksSection,
    renderSeeAlso,
    renderSignature,
    renderSummarySection,
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
 * 1. See (if any)
 *
 * @param apiItem - The API item being rendered.
 * @param innerSectionBody - A doc section of contents to be written after the standard metadata content types.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
export function renderChildrenSection(
    apiItem: ApiItem,
    innerSectionBody: DocSection | undefined,
    config: Required<MarkdownDocumenterConfiguration>,
): DocSection {
    const docSections: DocSection[] = [];

    // Render beta warning if applicable
    if (ApiReleaseTagMixin.isBaseClassOf(apiItem) && apiItem.releaseTag === ReleaseTag.Beta) {
        docSections.push(
            new DocSection({ configuration: config.tsdocConfiguration }, [
                renderBetaWarning(config),
            ]),
        );
    }

    // Render deprecation notice (if any)
    const renderedDeprecationNotice = renderDeprecationNoticeSection(apiItem, config);
    if (renderedDeprecationNotice !== undefined) {
        docSections.push(renderedDeprecationNotice);
    }

    // Render summary comment (if any)
    const renderedSummary = renderSummarySection(apiItem);
    if (renderedSummary !== undefined) {
        docSections.push(renderedSummary);
    }

    // Render @remarks content (if any)
    const renderedRemarks = renderRemarksSection(apiItem, config);
    if (renderedRemarks !== undefined) {
        docSections.push(renderedRemarks);
    }

    // Render examples (if any)
    const renderedExamples = renderExamplesSection(apiItem, config);
    if (renderedExamples !== undefined) {
        docSections.push(renderedExamples);
    }

    // Render signature (if any)
    const renderedSignature = renderSignature(apiItem, config);
    if (renderedSignature !== undefined) {
        docSections.push(renderedSignature);
    }

    if (innerSectionBody !== undefined) {
        // Flatten contents into this section
        docSections.push(innerSectionBody);
    }

    // Render @see content (if any)
    const renderedSee = renderSeeAlso(apiItem, config);
    if (renderedSee !== undefined) {
        docSections.push(renderedSee);
    }

    // Merge sections to reduce and simplify hierarchy
    const mergedSections = mergeSections(docSections, config.tsdocConfiguration);

    // Add heading to top of section only if this is being rendered to a parent item.
    // Document items have their headings handled specially.
    return doesItemRequireOwnDocument(apiItem, config.documentBoundaries)
        ? mergedSections
        : new DocSection(
              {
                  configuration: config.tsdocConfiguration,
              },
              [renderHeadingForApiItem(apiItem, config), mergedSections],
          );
}
