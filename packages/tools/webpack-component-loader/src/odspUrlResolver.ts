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
    IOdspAuthInfo,
} from "@microsoft/fluid-odsp-utils";

export class OdspUrlResolver implements IUrlResolver {
    private readonly driverUrlResolver = new OdspDriverUrlResolver();
    private readonly authInfo: IOdspAuthInfo;

    constructor(
        server: string,
        clientConfig: IClientConfig,
        accessToken: string,
    ) {
        this.authInfo = {
            server,
            clientConfig,
            tokens: {
                accessToken,
                refreshToken: "", // not allowed
            },
        };
    }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        const url = new URL(request.url);

        const documentId = url.pathname.substr(1).split("/")[0];
        const filePath = this.formFilePath(documentId);

        const { drive, item } = await getDriveItemByRootFileName(
            "",
            filePath,
            this.authInfo,
            true);

        const odspUrl = createOdspUrl(
            `https://${this.authInfo.server}`,
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
