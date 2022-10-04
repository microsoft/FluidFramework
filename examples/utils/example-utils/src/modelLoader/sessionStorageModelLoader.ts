/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions";
import {
    LocalResolver,
    LocalDocumentServiceFactory,
    LocalSessionStorageDbFactory,
    createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";
import { IModelLoader } from "./interfaces";
import { ModelLoader } from "./modelLoader";

const urlResolver = new LocalResolver();

const deltaConnectionServerMap = new Map<string, ILocalDeltaConnectionServer>();
const getDocumentServiceFactory = (documentId: string) => {
    let deltaConnection = deltaConnectionServerMap.get(documentId);
    if (deltaConnection === undefined) {
        deltaConnection = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
        deltaConnectionServerMap.set(documentId, deltaConnection);
    }

    return new LocalDocumentServiceFactory(deltaConnection);
};

export class SessionStorageModelLoader<ModelType> implements IModelLoader<ModelType> {
    public constructor(private readonly codeLoader: ICodeDetailsLoader) { }

    public async supportsVersion(version: string): Promise<boolean> {
        return true;
    }

    public async createDetached(version: string) {
        const documentId = uuid();
        const modelLoader = new ModelLoader<ModelType>({
            urlResolver,
            documentServiceFactory: getDocumentServiceFactory(documentId),
            codeLoader: this.codeLoader,
            generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
        });
        return modelLoader.createDetached(version);
    }
    public async loadExisting(id: string) {
        const documentId = id;
        const modelLoader = new ModelLoader<ModelType>({
            urlResolver,
            documentServiceFactory: getDocumentServiceFactory(documentId),
            codeLoader: this.codeLoader,
            generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
        });
        return modelLoader.loadExisting(`${window.location.origin}/${id}`);
    }
}
