/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import Axios from "axios";

export class GatewayTokenProvider implements ITokenProvider {
    constructor(
        private readonly baseUrl: string,
        private readonly refreshToken: string,
        private readonly url: string) {

    }

    public async fetchOrdererToken(): Promise<ITokenResponse> {
        const token = await this.fetchTokenInternal();
        return {
            fromCache: false,
            jwt: token,
        };
    }

    public async fetchStorageToken(): Promise<ITokenResponse> {
        const token = await this.fetchTokenInternal();
        return {
            fromCache: false,
            jwt: token,
        };
    }

    private async fetchTokenInternal(): Promise<string> {
        const headers = {
            "Authorization": `Bearer ${this.refreshToken}`,
            "Content-Type": `application/json`,
        };

        const tokenData = await Axios.post<string>(
            `${this.baseUrl}/api/v1/token`,
            {
                url: this.url,
            },
            {
                headers,
            });

        return tokenData.data;
    }
}
