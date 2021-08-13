/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Implementation of a URL resolver to resolve documents stored using the FRS service
// based off of the orderer and storage URLs provide. The token provider here can be a
// InsecureTokenProvider for basic scenarios or more robust, secure providers that fulfill the
// ITokenProvider interface
export class FrsUrlResolver {
    constructor(tenantId, orderer, storage, documentId, tokenProvider) {
        this.tenantId = tenantId;
        this.orderer = orderer;
        this.storage = storage;
        this.documentId = documentId;
        this.tokenProvider = tokenProvider;
    }
    async resolve(request) {
        const containerId = request.url.split("/")[0];
        const token = (await this.tokenProvider.fetchOrdererToken(this.tenantId, this.documentId)).jwt;
        const documentUrl = `${this.orderer}/${this.tenantId}/${containerId}`;
        return Promise.resolve({
            endpoints: {
                deltaStorageUrl: `${this.orderer}/deltas/${this.tenantId}/${containerId}`,
                ordererUrl: `${this.orderer}`,
                storageUrl: `${this.storage}/repos/${this.tenantId}`,
            },
            id: containerId,
            tokens: { jwt: token },
            type: "fluid",
            url: documentUrl,
        });
    }
    async getAbsoluteUrl(resolvedUrl, relativeUrl) {
        if (resolvedUrl.type !== "fluid") {
            throw Error("Invalid Resolved Url");
        }
        return `${resolvedUrl.url}/${relativeUrl}`;
    }
}
//# sourceMappingURL=FrsUrlResolver.js.map