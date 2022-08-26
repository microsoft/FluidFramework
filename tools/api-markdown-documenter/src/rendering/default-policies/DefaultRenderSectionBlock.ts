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
    renderSignature,
    renderSummarySection,
    renderThrowsSection,
} from "../helpers";

/**
 * Default rendering format for API item sections.
 * Wraps the item-kind-specific details in the following manner:
 *
 * 1. Heading (if not the document-root item, in which case headings are handled specially by document-level rendering)
 * 1. Beta warning (if item annotated with `@beta`)
 * 1. Deprecation notice (if any)
 * 1. Summary (if any)
 * 1. Item Signature
 * 1. Remarks (if any)
 * 1. Examples (if any)
 * 1. `innerSectionBody`
 * 1. Throws (if any)
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

    // Render signature
    const renderedSignature = renderSignature(apiItem, config);
    if (renderedSignature !== undefined) {
        docSections.push(renderedSignature);
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

    if (innerSectionBody !== undefined) {
        // Flatten contents into this section
        docSections.push(innerSectionBody);
    }

    // Render @throws content (if any)
    const renderedThrows = renderThrowsSection(apiItem, config);
    if (renderedThrows !== undefined) {
        docSections.push(renderedThrows);
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
