/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";
import {
    getDriveItemByRootFileName,
    IClientConfig,
    IODSPTokens,
} from "@microsoft/fluid-odsp-utils";

export class OdspUrlResolver implements IUrlResolver {
    private readonly driverUrlResolver = new OdspDriverUrlResolver();

    constructor(
        private readonly server: string,
        private readonly clientConfig: IClientConfig,
        private readonly accessToken: string,
    ) {}

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const url = new URL(request.url);

        const documentId = url.pathname.substr(1).split("/")[0];
        const filePath = this.formFilePath(documentId);

        const odspTokens: IODSPTokens = {
            accessToken: this.accessToken,
            refreshToken: "", // do not allow
        };

        const { drive, item } = await getDriveItemByRootFileName(
            this.server,
            "",
            filePath,
            this.clientConfig,
            odspTokens,
            true);

        const odspUrl = createOdspUrl(
            this.server,
            drive,
            item,
            "");

        return this.driverUrlResolver.resolve({ url: odspUrl });
    }

    private formFilePath(documentId: string): string {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }
}
