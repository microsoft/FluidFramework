/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPragueResolvedUrl, IRequest, IResolvedUrl, IUrlResolver } from "@prague/container-definitions";
import { ISocketStorageDiscovery } from "./contracts";

export class SharepointUrlResolver implements IUrlResolver {
    constructor(private readonly storageDiscoveryPromise: Promise<ISocketStorageDiscovery>) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        // TODO: no need to resolve the request against SPO now. We already have SPO info from Purple app. In theory, this resolve would take an SPO typical doc url and perform the SPO joinSession steps to retrieve all this info.
        console.log(`resolving url=${JSON.stringify(request)}`);
        const pragueSocketStorageDiscovery = await this.storageDiscoveryPromise;
        const documentUrl =
            `prague://${new URL(pragueSocketStorageDiscovery.deltaStorageUrl).host}` +
            `/${encodeURIComponent(pragueSocketStorageDiscovery.tenantId)}` +
            `/${encodeURIComponent(pragueSocketStorageDiscovery.id)}`;

        // tslint:disable-next-line: no-unnecessary-local-variable
        const response: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl: pragueSocketStorageDiscovery.deltaStorageUrl,
                ordererUrl: pragueSocketStorageDiscovery.deltaStreamSocketUrl,
                storageUrl: pragueSocketStorageDiscovery.snapshotStorageUrl,
            },
            tokens: {
                socketToken: pragueSocketStorageDiscovery.socketToken,
                storageToken: pragueSocketStorageDiscovery.storageToken,
            },
            type: "prague",
            url: documentUrl,
        };

        return response;
    }
}
