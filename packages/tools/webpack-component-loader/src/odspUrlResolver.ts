/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IResolvedUrl, IExperimentalUrlResolver } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { createOdspUrl, OdspDriverUrlResolver, INewFileInfo } from "@microsoft/fluid-odsp-driver";
import {
    getDriveItemByRootFileName,
    IOdspAuthRequestInfo,
} from "@microsoft/fluid-odsp-utils";
import { ISummaryTree } from "@microsoft/fluid-protocol-definitions";
import { getRandomName } from "@microsoft/fluid-server-services-client";

export class OdspUrlResolver implements IUrlResolver, IExperimentalUrlResolver {
    public readonly isExperimentalUrlResolver = true;
    private readonly driverUrlResolver = new OdspDriverUrlResolver();

    constructor(
        private readonly server: string,
        private readonly authRequestInfo: IOdspAuthRequestInfo,
        private readonly driveId: string,
    ) {}

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
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

        return this.driverUrlResolver.resolve({ url: odspUrl });
    }

    public async createContainer(
        createNewSummary: ISummaryTree,
        request: IRequest,
    ): Promise<IResolvedUrl> {
        const filename = getRandomName("-");

        const fileInfo: INewFileInfo = {
            filePath: "/r11s/",
            filename,
            siteUrl: `https://${this.server}`,
            driveId: this.driveId,
        };

        request.url = `${request.url}?uniqueId=${filename}`;
        request.headers = {
            newFileInfoPromise: Promise.resolve(fileInfo),
        };
        return this.driverUrlResolver.createContainer(createNewSummary, request);
    }

    private formFilePath(documentId: string): string {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }
}
