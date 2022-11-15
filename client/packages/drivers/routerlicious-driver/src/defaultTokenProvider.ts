/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider, ITokenResponse } from "./tokens";

/**
 * Default token provider in case the host does not provide one. It simply caches the provided jwt and returns it back.
 */

export class DefaultTokenProvider implements ITokenProvider {
    constructor(private readonly jwt: string) {

    }

    public async fetchOrdererToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.jwt,
        };
    }

    public async fetchStorageToken(): Promise<ITokenResponse> {
        return {
            fromCache: true,
            jwt: this.jwt,
        };
    }
}
