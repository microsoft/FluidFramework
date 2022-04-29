/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

export interface ITokenClaims {
    documentId: string;
    scopes: string[];
    tenantId: string;
    user: IUser;
    iat: number;
    exp: number;
    ver: string;
    jti?: string;
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
