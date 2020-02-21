/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IUrlResolver, IResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { createOdspUrl, OdspDriverUrlResolver } from "@microsoft/fluid-odsp-driver";
import {
    getDriveItemByRootFileName,
    IOdspAuthRequestInfo,
} from "@microsoft/fluid-odsp-utils";
import { ISummaryTree, ICommittedProposal } from "@microsoft/fluid-protocol-definitions";

export class OdspUrlResolver implements IUrlResolver {
    private readonly driverUrlResolver = new OdspDriverUrlResolver();

    constructor(
        private readonly server: string,
        private readonly authRequestInfo: IOdspAuthRequestInfo,
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

    private formFilePath(documentId: string): string {
        const encoded = encodeURIComponent(`${documentId}.fluid`);
        return `/r11s/${encoded}`;
    }

    public async create(
        summary: ISummaryTree,
        sequenceNumber: number,
        values: [string, ICommittedProposal][],
        options: any,
    ): Promise<IResolvedUrl> {
        throw new Error("Method not implemented.");
    }
}
