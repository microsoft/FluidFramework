/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { SessionStorageDbFactory } from "@fluidframework/local-test-utils";
import { MultiDocumentServiceFactory } from "@fluidframework/driver-utils";
import { TestDocumentServiceFactory } from "@fluidframework/local-driver";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { RouterliciousDocumentServiceFactory, DefaultErrorTracking } from "@fluidframework/routerlicious-driver";
import { RouteOptions } from "./loader";

const deltaConns = new Map<string, ILocalDeltaConnectionServer>();

export function getDocumentServiceFactory(documentId: string, options: RouteOptions) {
    const deltaConn = deltaConns.get(documentId) ??
        LocalDeltaConnectionServer.create(new SessionStorageDbFactory(documentId));
    deltaConns.set(documentId, deltaConn);

    return MultiDocumentServiceFactory.create([
        new TestDocumentServiceFactory(deltaConn),
        // TODO: web socket token
        new OdspDocumentServiceFactory(
            async () => options.mode === "spo" || options.mode === "spo-df" ? options.odspAccessToken : undefined,
            async () => options.mode === "spo" || options.mode === "spo-df" ? options.pushAccessToken : undefined,
            undefined,
            undefined,
            undefined,
        ),
        new RouterliciousDocumentServiceFactory(
            false,
            new DefaultErrorTracking(),
            false,
            true,
            undefined,
        ),
    ]);
}
