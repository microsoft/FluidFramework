/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider } from "@prague/protocol-definitions";

/**
 * Provides basic token related apis.
 */
export class TokenProvider implements ITokenProvider {

    /**
     * Storage token - for snapshots and delta storage
     */
    public readonly storageToken: string | null;

    /**
     * Socket token - for the delta stream (websockets)
     */
    public readonly socketToken: string | null;

    constructor(storageToken: string | null, socketToken: string | null) {
        this.storageToken = storageToken;
        this.socketToken = socketToken;
    }

    public isValid(): boolean {
        // The delta stream needs a token. The other endpoints can have cookie based auth
        return !!this.socketToken;
    }

    public getUrlAndHeadersWithAuth(url: string): { url: string, headers: { [index: string]: string } } {
        if (!this.storageToken || this.storageToken.length === 0) {
            return { url, headers: {} };
        }

        const queryParamStart = url.indexOf("?");

        // determine if we need to add ?, &, or nothing (if the url ends with ?)
        let tokenQueryParam = queryParamStart === -1 ? "?" : (queryParamStart !== url.length - 1 ? `&` : "");

        const tokenIsQueryParam = this.storageToken[0] === "?";
        if (tokenIsQueryParam) {
            // the token itself is a query param
            tokenQueryParam += this.storageToken.substring(1);

        } else {
            tokenQueryParam += `access_token=${encodeURIComponent(this.storageToken)}`;
        }

        if (tokenIsQueryParam || (url.length + tokenQueryParam.length) < 2048) {
            return {
                headers: {},
                url: url + tokenQueryParam,
            };
        }

        return {
            headers: {
                Authorization: `Bearer ${this.storageToken}`,
            },
            url,
        };
    }

    /**
     * Returns the default headers to pass when calling storage apis
     */
    public getStorageHeaders(): { [index: string]: string | undefined } {
        const headers: { Authorization?: string } = {};

        if (this.storageToken && this.storageToken.length > 0 && this.storageToken[0] !== "?") {
            headers.Authorization = `Bearer ${this.storageToken}`;
        }

        return headers;
    }

    /**
     * Returns the default query params to pass when calling storage apis
     */
    public getStorageQueryParams(): { [index: string]: string } {
        const queryParams = {};

        if (this.storageToken && this.storageToken.length > 0 && this.storageToken[0] === "?") {
            // the token is one or more query params
            const split = this.storageToken
                .substring(1)
                .split("&");
            for (const part of split) {
                const kv = part.indexOf("=");
                if (kv !== -1) {
                    queryParams[part.substr(0, kv)] = part.substr(kv + 1);
                }
            }
        }

        return queryParams;
    }
}
