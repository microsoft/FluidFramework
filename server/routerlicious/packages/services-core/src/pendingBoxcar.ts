/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { IPendingBoxcar } from "./queue";

// 1MB batch size / (16KB max message size + overhead)
export const MaxBatchSize = 32;

export class PendingBoxcar implements IPendingBoxcar {
    public deferred = new Deferred<void>();
    public messages: any[] = [];
    public partitionId?: number;

    constructor(public tenantId: string, public documentId: string) {
    }
}
