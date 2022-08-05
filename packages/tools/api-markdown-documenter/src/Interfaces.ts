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
}

export interface Link {
    text: string;
    uriBase: string;
    relativeFilePath: string;
    headingId?: string;
}
