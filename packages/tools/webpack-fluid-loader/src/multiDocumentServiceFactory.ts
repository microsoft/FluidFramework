/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import { LocalDocumentServiceFactory, LocalSessionStorageDbFactory } from "@fluidframework/local-driver";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { getRandomName } from "@fluidframework/server-services-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { v4 as uuid } from "uuid";
import { IDevServerUser, IRouterliciousRouteOptions, RouteOptions } from "./loader";

export const deltaConns = new Map<string, ILocalDeltaConnectionServer>();

export function getDocumentServiceFactory(documentId: string, options: RouteOptions) {
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
    }
    else {
        routerliciousTokenProvider = new InsecureTokenProvider(
            (options as IRouterliciousRouteOptions).tenantSecret,
            getUser());
    }

    return MultiDocumentServiceFactory.create([
        new LocalDocumentServiceFactory(deltaConn),
        // TODO: web socket token
        new OdspDocumentServiceFactory(
            async () => options.mode === "spo" || options.mode === "spo-df" ? options.odspAccessToken : undefined,
            async () => options.mode === "spo" || options.mode === "spo-df" ? options.pushAccessToken : undefined,
        ),
        new RouterliciousDocumentServiceFactory(routerliciousTokenProvider),
    ]);
}
