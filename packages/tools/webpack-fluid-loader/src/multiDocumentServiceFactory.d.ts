/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { IPersistedCache } from "@fluidframework/odsp-driver-definitions";
import { RouteOptions } from "./loader";
export declare const deltaConns: Map<string, ILocalDeltaConnectionServer>;
export declare function getDocumentServiceFactory(documentId: string, options: RouteOptions, odspPersistantCache: IPersistedCache): import("@fluidframework/driver-definitions").IDocumentServiceFactory;
//# sourceMappingURL=multiDocumentServiceFactory.d.ts.map