/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiItem } from "@microsoft/api-extractor-model";
import { DocSection } from "@microsoft/tsdoc";

/**
 * Represents Markdown document contents that have not yet been written to a file.
 */
export interface MarkdownDocument {
    /**
     * The root API item for which the document contents were generated.
     */
    apiItem: ApiItem;

    /**
     * Mardown document contents.
     *
     * @privateRemarks
     * TODO: long term this should be a more general Markdown AST (abstract syntax tree).
     * The current MarkdownEmitter logic can then be replaced with a simple interface (and some default policies)
     * for processing that tree and writing out Markdown to an output stream.
     */
    contents: DocSection;

    /**
     * Output path for the document to be written to.
     *
     * @remarks This path is relative to the base URI provided to the system.
     */
    path: string;
}
