/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser, ScopeType } from "@fluidframework/protocol-definitions";

/**
 * Method signature for a token generator
 */
export type TokenGenerator = (
    tenantId: string,
    documendId: string,
    key: string,
    scopes: ScopeType[],
    user?: IUser,
    lifetime?: number,
    ver?: string) => string;
