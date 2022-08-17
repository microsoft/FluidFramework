/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a link to some documentation element.
 *
 * @remarks A complete URL link can be created from its components (see {@link urlFromLink}).
 */
export interface Link {
    /**
     * Link text to be rendered.
     */
    text: string;

    /**
     * URI base of the element being linked to.
     */
    uriBase: string;

    /**
     * Path to the document being linked to. Relative to {@link Link.uriBase}.
     */
    documentPath: string;

    /**
     * Optional ID of a heading in the document being linked to.
     */
    headingId?: string;
}

/**
 * Generates a complete URL for the provided {@link Link} object.
 */
export function urlFromLink(link: Link): string {
    const headingPostfix = link.headingId === undefined ? "" : `#${link.headingId}`;
    return `${link.uriBase}/${link.documentPath}${headingPostfix}`;
}
