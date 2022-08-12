/**
 * Represents Markdown document contents that have not yet been written to a file.
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
     * Output path for the document to be written to. This path is relative to the base URI provided to the system.
     * TODO: verify relative-ness
     */
    path: string;
}
