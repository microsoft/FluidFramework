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
