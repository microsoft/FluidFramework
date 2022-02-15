/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IGetRefParamsExternal } from "@fluidframework/server-services-client";
import { IExternalWriterConfig } from "./definitions";

/**
 * Validates that the input encoding is valid
 */
 export function validateBlobEncoding(encoding: BufferEncoding): boolean {
    return encoding === "utf-8" || encoding === "base64";
}

/**
 * Validates blob content exists
 */
export function validateBlobContent(content: string): boolean {
    return content !== undefined && content !== null;
}

/**
 * Helper function to decode externalstorage read params
 */
export function getExternalWriterParams(params: string | undefined): IExternalWriterConfig | undefined {
    if (params) {
        const getRefParams: IGetRefParamsExternal = JSON.parse(decodeURIComponent(params));
        return getRefParams.config;
    }
    return undefined;
}
