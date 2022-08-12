import { ApiItem } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

/**
 * Represents Markdown document contents that have not yet been written to a file.
 */
export interface MarkdownDocument {
    /**
     * The API item for which the document contents were generated.
     */
    apiItem: ApiItem;

    /**
     * Mardown document contents.
     */
    contents: DocSection;

    /**
     * Output path for the document to be written to. This path is relative to the base URI provided to the system.
     * TODO: verify relative-ness
     */
    path: string;
}
