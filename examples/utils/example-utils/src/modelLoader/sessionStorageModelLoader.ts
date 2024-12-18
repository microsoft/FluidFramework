/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions/legacy";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
// eslint-disable-next-line import/no-internal-modules -- #!!!: `local-driver` internal LocalSessionStorageDbFactory used in examples
import { LocalSessionStorageDbFactory } from "@fluidframework/local-driver/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
	createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver/legacy";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";

import { IDetachedModel, IModelLoader } from "./interfaces.js";
import { ModelLoader } from "./modelLoader.js";

const urlResolver = new LocalResolver();

const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());

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
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
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
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return modelLoader.loadExisting(`${window.location.origin}/${id}`);
	}
	public async loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType> {
		const modelLoader = new ModelLoader<ModelType>({
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: this.codeLoader,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(id),
		});
		return modelLoader.loadExistingPaused(`${window.location.origin}/${id}`, sequenceNumber);
	}
}
