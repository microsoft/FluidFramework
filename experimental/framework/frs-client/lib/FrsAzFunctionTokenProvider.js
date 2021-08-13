/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import axios from "axios";
export class FrsAzFunctionTokenProvider {
    constructor(azFunctionUrl, user) {
        this.azFunctionUrl = azFunctionUrl;
        this.user = user;
    }
    async fetchOrdererToken(tenantId, documentId) {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }
    async fetchStorageToken(tenantId, documentId) {
        return {
            jwt: await this.getToken(tenantId, documentId),
        };
    }
    async getToken(tenantId, documentId) {
        var _a, _b, _c;
        return axios.get(this.azFunctionUrl, {
            params: {
                tenantId,
                documentId,
                userId: (_a = this.user) === null || _a === void 0 ? void 0 : _a.userId,
                userName: (_b = this.user) === null || _b === void 0 ? void 0 : _b.userName,
                additionalDetails: (_c = this.user) === null || _c === void 0 ? void 0 : _c.additionalDetails,
            },
        }).then((response) => {
            return response.data;
        }).catch((err) => {
            return err;
        });
    }
}
//# sourceMappingURL=FrsAzFunctionTokenProvider.js.map