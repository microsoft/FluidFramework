/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUser } from "./users";

/**
 * TODO
 */
export interface ITokenClaims {
    /**
     * TODO
     */
    documentId: string;
    /**
     * TODO
     */
    scopes: string[];
    /**
     * TODO
     */
    tenantId: string;
    /**
     * TODO
     */
    user: IUser;
    /**
     * TODO
     * Also, units?
     */
    iat: number;
    /**
     * TODO
     * Also, units?
     */
    exp: number;
    /**
     * TODO
     */
    ver: string;
    /**
     * TODO
     */
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
