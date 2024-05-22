/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";

/**
 * C1 can revoke an access token of a client
 * @internal
 */
export const TokenRevokeScopeType = "token:revoke";
/**
 * C1 can delete a docuemnt
 * @internal
 */
export const DocDeleteScopeType = "doc:delete";

/**
 * @internal
 */
export const canRead = (scopes: string[]) => scopes.includes(ScopeType.DocRead);
/**
 * @internal
 */
export const canWrite = (scopes: string[]) => scopes.includes(ScopeType.DocWrite);
/**
 * @internal
 */
export const canSummarize = (scopes: string[]) => scopes.includes(ScopeType.SummaryWrite);
/**
 * @internal
 */
export const canRevokeToken = (scopes: string[]) => scopes.includes(TokenRevokeScopeType);
/**
 * Delete document permission.
 * @param scopes - Document delete scope type
 * @internal
 */
export const canDeleteDoc = (scopes: string[]) => scopes.includes(DocDeleteScopeType);
