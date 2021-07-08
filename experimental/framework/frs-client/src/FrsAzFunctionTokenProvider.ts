/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import axios from "axios";

export class FrsAzFunctionTokenProvider implements ITokenProvider {
    constructor(private readonly aazFunctionUrl: string, private readonly user: {
            id: string,
            name: string,
        },
    ) { }

    public async fetchOrdererToken(tenantId: string, documentId: string, refresh?: boolean): Promise<ITokenResponse> {
        const jwt = await this.getToken(tenantId, documentId);
        return {
            jwt,
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string, refresh?: boolean): Promise<ITokenResponse> {
        const jwt = await this.getToken(tenantId, documentId);
        return {
            jwt,
        };
    }

    private async getToken(tenantId: string, documentId: string) {
        return axios.get(this.aazFunctionUrl, {
            params: {
                tenantId,
                documentId,
                userId: this.user?.id,
                username: this.user?.name,
            },
        }).then((response) => {
            return response.data as string;
        });
    }
}
