/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { LocalDocumentServiceFactory, LocalSessionStorageDbFactory } from "@fluidframework/local-driver";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { HostStoragePolicy, IPersistedCache } from "@fluidframework/odsp-driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { getRandomName } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";

import { v4 as uuid } from "uuid";

import { IDevServerUser, IRouterliciousRouteOptions, RouteOptions } from "./loader";

export const deltaConns = new Map<string, ILocalDeltaConnectionServer>();

export function getDocumentServiceFactory(
    documentId: string,
    options: RouteOptions,
    odspPersistantCache?: IPersistedCache,
    odspHostStoragePolicy?: HostStoragePolicy,
): IDocumentServiceFactory {
    const deltaConn = deltaConns.get(documentId) ??
        LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory(documentId));
    deltaConns.set(documentId, deltaConn);

    const getUser = (): IDevServerUser => ({
        id: uuid(),
        name: getRandomName(),
    });

    let routerliciousTokenProvider: InsecureTokenProvider;
    // tokenprovider and routerlicious document service will not be called for local and spo server.
    if (options.mode === "tinylicious") {
        routerliciousTokenProvider = new InsecureTokenProvider(
            "12345",
            getUser());
    } else {
        const routerliciousRouteOptions = options as IRouterliciousRouteOptions;
        assert(
            routerliciousRouteOptions !== undefined,
            0x31d /* options are not of type "IRouterliciousRouteOptions" as expected */);
        routerliciousTokenProvider = new InsecureTokenProvider(
            routerliciousRouteOptions.tenantSecret ?? "",
            getUser());
    }

    switch (options.mode) {
        case "docker":
        case "r11s":
        case "tinylicious":
            return new RouterliciousDocumentServiceFactory(
                routerliciousTokenProvider,
                {
                    enableWholeSummaryUpload: options.mode === "r11s" || options.mode === "docker"
                        ? options.enableWholeSummaryUpload
                        : undefined,
                    enableDiscovery: options.mode === "r11s" && options.discoveryEndpoint !== undefined,
                },
            );

        case "spo":
        case "spo-df":
            // TODO: web socket token
            return new OdspDocumentServiceFactory(
                async () => options.odspAccessToken ?? null,
                async () => options.pushAccessToken ?? null,
                odspPersistantCache,
                odspHostStoragePolicy,
            );

        default: // Local
            return new LocalDocumentServiceFactory(deltaConn);
    }
}
