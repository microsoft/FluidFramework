"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OdspUrlResolver = void 0;
const odsp_doclib_utils_1 = require("@fluidframework/odsp-doclib-utils");
const odsp_driver_1 = require("@fluidframework/odsp-driver");
class OdspUrlResolver {
    constructor(server, authRequestInfo) {
        this.server = server;
        this.authRequestInfo = authRequestInfo;
        this.driverUrlResolver = new odsp_driver_1.OdspDriverUrlResolver();
    }
    async resolve(request) {
        try {
            const resolvedUrl = await this.driverUrlResolver.resolve(request);
            return resolvedUrl;
        }
        catch (error) { }
        const url = new URL(request.url);
        const fullPath = url.pathname.substr(1);
        const documentId = fullPath.split("/")[0];
        const dataStorePath = fullPath.slice(documentId.length + 1);
        const filePath = this.formFilePath(documentId);
        const { driveId, itemId } = await odsp_doclib_utils_1.getDriveItemByRootFileName(this.server, "", filePath, this.authRequestInfo, true);
        const odspUrl = odsp_driver_1.createOdspUrl({
            siteUrl: `https://${this.server}`,
            driveId,
            itemId,
            dataStorePath,
        });
        return this.driverUrlResolver.resolve({ url: odspUrl, headers: request.headers });
    }
    formFilePath(documentId) {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }
    async getAbsoluteUrl(resolvedUrl, relativeUrl) {
        return this.driverUrlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl);
    }
    async createCreateNewRequest(fileName) {
        const filePath = "/r11s/";
        const driveItem = await odsp_doclib_utils_1.getDriveItemByRootFileName(this.server, "", filePath, this.authRequestInfo, false);
        return this.driverUrlResolver.createCreateNewRequest(`https://${this.server}`, driveItem.driveId, filePath, `${fileName}.fluid`);
    }
}
exports.OdspUrlResolver = OdspUrlResolver;
//# sourceMappingURL=odspUrlResolver.js.map