export interface Link {
    text: string;
    uriBase: string;
    relativeFilePath: string;
    headingId?: string;
}

/**
 * Generates a complete URL for the provided {@link Link} object.
 */
export function urlFromLink(link: Link): string {
    const headingPostfix = link.headingId === undefined ? "" : `#${link.headingId}`;
    return `${link.uriBase}/${link.relativeFilePath}${headingPostfix}`;
}
