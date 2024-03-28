/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	LocalSessionStorageDbFactory,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";

import { IDetachedModel, IModelLoader } from "./interfaces.js";
import { ModelLoader } from "./modelLoader.js";

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

/**
 * @internal
 */
export class SessionStorageModelLoader<ModelType> implements IModelLoader<ModelType> {
	public constructor(
		private readonly codeLoader: ICodeDetailsLoader,
		private readonly logger?: ITelemetryBaseLogger,
	) {}

	public async supportsVersion(version: string): Promise<boolean> {
		return true;
	}

	public async createDetached(version: string): Promise<IDetachedModel<ModelType>> {
		const documentId = uuid();
		const modelLoader = new ModelLoader<ModelType>({
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(documentId),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return modelLoader.createDetached(version);
	}
	public async loadExisting(id: string): Promise<ModelType> {
		const documentId = id;
		const modelLoader = new ModelLoader<ModelType>({
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(documentId),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return modelLoader.loadExisting(`${window.location.origin}/${id}`);
	}
	public async loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType> {
		const modelLoader = new ModelLoader<ModelType>({
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(id),
			codeLoader: this.codeLoader,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(id),
		});
		return modelLoader.loadExistingPaused(`${window.location.origin}/${id}`, sequenceNumber);
	}
}
