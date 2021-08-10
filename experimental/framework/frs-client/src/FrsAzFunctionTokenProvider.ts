/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import axios from "axios";
import { FrsMember } from "./interfaces";

export class FrsAzFunctionTokenProvider implements ITokenProvider {
    constructor(
        private readonly azFunctionUrl: string,
        private readonly user?: Pick<FrsMember, "userId" | "userName" | "additionalDetails">,
    ) { }

    public async fetchOrdererToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }

    private async getToken(tenantId: string, documentId: string): Promise<string> {
        return axios.get(this.azFunctionUrl, {
            params: {
                tenantId,
                documentId,
                userId: this.user?.userId,
                userName: this.user?.userName,
                additionalDetails: this.user?.additionalDetails,
            },
        }).then((response) => {
            return response.data as string;
        }).catch((err) => {
            return err as string;
        });
    }
}
