/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import { LocalDocumentServiceFactory, LocalSessionStorageDbFactory } from "@fluidframework/local-driver";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { HostStoragePolicy, IPersistedCache } from "@fluidframework/odsp-driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { getRandomName } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { assert } from "@fluidframework/common-utils";
import { v4 as uuid } from "uuid";
import { IDevServerUser, IRouterliciousRouteOptions, RouteOptions } from "./loader";

export const deltaConns = new Map<string, ILocalDeltaConnectionServer>();

export function getDocumentServiceFactory(
    documentId: string,
    options: RouteOptions,
    odspPersistantCache?: IPersistedCache,
    odspHostStoragePolicy?: HostStoragePolicy,
) {
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
            "options are not of type \"IRouterliciousRouteOptions\" as expected");
        routerliciousTokenProvider = new InsecureTokenProvider(
            routerliciousRouteOptions.tenantSecret ?? "",
            getUser());
    }

    return MultiDocumentServiceFactory.create([
        new LocalDocumentServiceFactory(deltaConn),
        // TODO: web socket token
        new OdspDocumentServiceFactory(
            async () => options.mode === "spo" || options.mode === "spo-df" ? (options.odspAccessToken ?? null) : null,
            async () => options.mode === "spo" || options.mode === "spo-df" ? (options.pushAccessToken ?? null) : null,
            odspPersistantCache,
            odspHostStoragePolicy,
        ),
        new RouterliciousDocumentServiceFactory(
            routerliciousTokenProvider,
            {
                enableWholeSummaryUpload: options.mode === "r11s" || options.mode === "docker"
                    ? options.enableWholeSummaryUpload
                    : undefined,
                enableDiscovery: options.mode === "r11s" && options.discoveryEndpoint !== undefined,
            }),
    ]);
}
