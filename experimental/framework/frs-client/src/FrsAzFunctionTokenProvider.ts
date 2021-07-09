/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import axios from "axios";

export class FrsAzFunctionTokenProvider implements ITokenProvider {
    constructor(private readonly azFunctionUrl: string, private readonly user?: IUser,
    ) { }

    public async fetchOrdererToken(tenantId: string, documentId: string, refresh?: boolean): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string, refresh?: boolean): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    private async getToken(tenantId: string, documentId: string) {
        return axios.get(this.azFunctionUrl, {
            params: {
                tenantId,
                documentId,
                userId: this.user?.id,
            },
        }).then((response) => {
            return response.data as string;
        }).catch((err) => {
            return err as string;
        });
    }
}
