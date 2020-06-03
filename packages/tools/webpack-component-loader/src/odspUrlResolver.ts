/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/component-core-interfaces";
import { OdspDriverUrlResolver, createOdspUrl } from "@fluidframework/odsp-driver";
import {
    IOdspAuthRequestInfo,
    getDriveItemByRootFileName,
} from "@fluidframework/odsp-utils";

export class OdspUrlResolver implements IUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly driverUrlResolver = new OdspDriverUrlResolver();

    constructor(
        private readonly server: string,
        private readonly authRequestInfo: IOdspAuthRequestInfo,
    ) {}

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        try {
            const resolvedUrl = await this.driverUrlResolver.resolve(request);
            return resolvedUrl;
        } catch (error) {}

        const url = new URL(request.url);

        const documentId = url.pathname.substr(1).split("/")[0];
        const filePath = this.formFilePath(documentId);

        const { drive, item } = await getDriveItemByRootFileName(
            this.server,
            "",
            filePath,
            this.authRequestInfo,
            true);

        const odspUrl = createOdspUrl(
            `https://${this.server}`,
            drive,
            item,
            "");

        return this.driverUrlResolver.resolve({ url: odspUrl, headers: request.headers });
    }

    private formFilePath(documentId: string): string {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }

    public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
        return this.driverUrlResolver.getAbsoluteUrl(resolvedUrl, relativeUrl);
    }

    public createCreateNewRequest(siteUrl: string, driveId: string, filePath: string, fileName: string): IRequest {
        return this.driverUrlResolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    }
}
