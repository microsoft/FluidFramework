/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";

/**
* C1 can revoke an access token of a client
*/
const TokenRevokeScopeType = "token:revoke";

export const canRead = (scopes: string[]) => scopes.includes(ScopeType.DocRead);
export const canWrite = (scopes: string[]) => scopes.includes(ScopeType.DocWrite);
export const canSummarize = (scopes: string[]) => scopes.includes(ScopeType.SummaryWrite);
export const canRevokeToken = (scopes: string[]) => scopes.includes(TokenRevokeScopeType);
