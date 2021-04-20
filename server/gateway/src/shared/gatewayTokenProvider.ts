/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import Axios from "axios";
import jwtDecode from "jwt-decode";

/**
 * Example token provider for gateway. It expects a pair of access and refresh token and uses the refresh
 * token to fetch a new access token. It also provides a simple silent refresh flow and caches new token locally.
 */
export class GatewayTokenProvider implements ITokenProvider {
    // Silent refresh timer
    private expirationTimer: ReturnType<typeof setTimeout> | undefined;

    // Seconds until the next refresh
    private readonly remainingLifetime: number = 30;

    constructor(
        private readonly baseUrl: string,
        private readonly resolvedUrl: string,
        private readonly refreshToken: string,
        private accessToken: string) {
            this.fetchTokenInTimer();
    }

    public async fetchOrdererToken(): Promise<ITokenResponse> {
        return this.getOrFetch();
    }

    public async fetchStorageToken(): Promise<ITokenResponse> {
        return this.getOrFetch();
    }

    private async getOrFetch(fromCache: boolean = true): Promise<ITokenResponse> {
        if (!this.shouldForceFetch()) {
            return {
                fromCache,
                jwt: this.accessToken,
            };
        } else {
            await this.fetchTokenForce();
            return this.getOrFetch(false);
        }
    }

    private async fetchTokenForce() {
        this.clearExpirationTimer();
        this.accessToken = await this.fetchTokenInternal();
        this.fetchTokenInTimer();
    }

    private fetchTokenInTimer() {
        this.clearExpirationTimer();
        const nextRefresh = this.getLifetime() - this.remainingLifetime;
        if (nextRefresh > 0) {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            this.expirationTimer = setTimeout(async () => {
                this.accessToken = await this.fetchTokenInternal();
                this.fetchTokenInTimer();
            }, nextRefresh * 1000);
        }
    }

    private async fetchTokenInternal(): Promise<string> {
        const headers = {
            "Authorization": `Bearer ${this.refreshToken}`,
            "Content-Type": `application/json`,
        };

        const tokenData = await Axios.post<string>(
            `${this.baseUrl}/api/v1/token`,
            {
                url: this.resolvedUrl,
            },
            {
                headers,
            });

        return tokenData.data;
    }

    private getLifetime(): number {
        const claims = jwtDecode<ITokenClaims>(this.accessToken);
        const nowSec = Math.round((new Date()).getTime() / 1000);
        return claims.exp - nowSec;
    }

    private clearExpirationTimer() {
        if (this.expirationTimer !== undefined) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = undefined;
        }
    }

    private shouldForceFetch(): boolean {
        return this.getLifetime() < (this.remainingLifetime / 2);
    }
}
