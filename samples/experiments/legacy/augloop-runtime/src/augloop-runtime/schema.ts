/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Schema constant.
 */
export const inputSchemaName = "DocumentTile";

/**
 * DocTile is the schema for input data we submit to the augmentation loop.
 */
export interface IDocTile {
    /**
     * Runtime document ID.
     */
    documentId: string;

    /**
     * Start index of the text.
     */
    begin: number;

    /**
     * End index of the text.
     */
    end: number;

    /**
     * Content of this document segment in JSON format.
     */
    content: string;

    /**
     * Request order sequence number.
     */
    reqOrd: number;

    /**
     * Request timestamp in milliseconds that have elapsed since January 1, 1970 at 00:00:00 UTC.
     */
    requestTime: number;
}

/**
 * DocTile is the input data we submit to the augmentation loop.
 */
export interface IAugResult {
    /**
     * Input passed to the loop.
     */
    input: IDocTile;

    /**
     * Received output.
     */
    output: any;
}
