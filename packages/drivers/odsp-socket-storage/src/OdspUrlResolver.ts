/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidResolvedUrl, IRequest, IResolvedUrl, IUrlResolver } from "@prague/container-definitions";
import { ISocketStorageDiscovery } from "./contracts";

export class OdspUrlResolver implements IUrlResolver {
    constructor(private readonly storageDiscoveryPromise: Promise<ISocketStorageDiscovery>) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        // TODO: no need to resolve the request against SPO now. We already have SPO info from Purple app. In theory, this resolve would take an SPO typical doc url and perform the SPO joinSession steps to retrieve all this info.
        console.log(`resolving url=${JSON.stringify(request)}`);
        const fluidSocketStorageDiscovery = await this.storageDiscoveryPromise;
        const documentUrl =
            `prague-odsp://${new URL(fluidSocketStorageDiscovery.deltaStorageUrl).host}` +
            `/${encodeURIComponent(fluidSocketStorageDiscovery.tenantId)}` +
            `/${encodeURIComponent(fluidSocketStorageDiscovery.id)}`;

        // tslint:disable-next-line: no-unnecessary-local-variable
        const response: IFluidResolvedUrl = {
            endpoints: {
                deltaStorageUrl: fluidSocketStorageDiscovery.deltaStorageUrl,
                ordererUrl: fluidSocketStorageDiscovery.deltaStreamSocketUrl,
                storageUrl: fluidSocketStorageDiscovery.snapshotStorageUrl,
            },
            tokens: {
                socketToken: fluidSocketStorageDiscovery.socketToken,
                storageToken: fluidSocketStorageDiscovery.storageToken,
            },
            type: "prague",
            url: documentUrl,
        };

        return response;
    }
}
