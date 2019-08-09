/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

export interface ITokenClaims {
    documentId: string;
    scopes: string[];
    tenantId: string;
    user: IUser;
}

export interface ISummaryTokenClaims {
    sub: string;
    act: IActorClient;
    claims: ITokenClaims;
}

export interface IActorClient {
    sub: string;
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
