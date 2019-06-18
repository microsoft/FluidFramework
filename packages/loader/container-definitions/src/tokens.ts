/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: IUser;
}

/**
 * The ITokenService abstracts the discovery of claims contained within a token
 */
export interface ITokenService {
    extractClaims(token: string): ITokenClaims;
}

export interface ITokenProvider {
    isValid(): boolean;
}
