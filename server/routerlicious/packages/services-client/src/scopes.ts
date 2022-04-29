/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";

export const canRead = (scopes: string[]) => scopes.includes(ScopeType.DocRead);
export const canWrite = (scopes: string[]) => scopes.includes(ScopeType.DocWrite);
export const canSummarize = (scopes: string[]) => scopes.includes(ScopeType.SummaryWrite);
