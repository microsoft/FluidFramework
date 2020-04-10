/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IResolvedUrl, IExperimentalUrlResolver } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { OdspDriverUrlResolver, createOdspUrl, IOdspNewFileParams } from "@microsoft/fluid-odsp-driver";
import {
    IOdspAuthRequestInfo,
    getDriveItemByRootFileName,
} from "@microsoft/fluid-odsp-utils";

export class OdspUrlResolver implements IUrlResolver, IExperimentalUrlResolver {
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
        } catch(error) {}

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

        return this.driverUrlResolver.resolve({url: odspUrl});
    }

    private formFilePath(documentId: string): string {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }

    public async requestUrl(resolvedUrl: IResolvedUrl, request: IRequest): Promise<string> {
        return this.driverUrlResolver.requestUrl(resolvedUrl, request);
    }

    public createCreateNewRequest(rawUrl: string, newFileParams: IOdspNewFileParams): IRequest {
        return this.driverUrlResolver.createCreateNewRequest(rawUrl, newFileParams);
    }

}
