/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspSummaryUploadManager } from "./odspSummaryUploadManager";

/**
 * This function only exists to create an ESM wrapper around the socket.io client module
 * for compatibility with ESM dynamic imports
 */
export function getOdspSummaryUploadManager(): typeof OdspSummaryUploadManager {
    return OdspSummaryUploadManager;
}
