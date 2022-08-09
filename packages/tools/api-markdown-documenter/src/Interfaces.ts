/**
 * TODO
 */
export interface MarkdownDocument {
    /**
     * Mardown document contents.
     */
    contents: string;

    /**
     * Name of the API item for which the document contents were generated.
     */
    apiItemName: string;

    /**
     * Output path for the document to be written to.
     * TODO: relative
     */
    path: string;
}

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
