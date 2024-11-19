/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodeDetailsLoader,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
	LocalSessionStorageDbFactory,
} from "@fluidframework/local-driver/internal";
import {
	type ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";

import type { ISimpleLoader } from "./interfaces.js";
import { SimpleLoader } from "./simpleLoader.js";

const urlResolver = new LocalResolver();

const deltaConnectionServerMap = new Map<string, ILocalDeltaConnectionServer>();
const getDocumentServiceFactory = (documentId: string): IDocumentServiceFactory => {
	let deltaConnection = deltaConnectionServerMap.get(documentId);
	if (deltaConnection === undefined) {
		deltaConnection = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
		deltaConnectionServerMap.set(documentId, deltaConnection);
	}

	return new LocalDocumentServiceFactory(deltaConnection);
};

/**
 * @alpha
 */
export class SessionStorageSimpleLoader implements ISimpleLoader {
	public constructor(
		private readonly codeLoader: ICodeDetailsLoader,
		private readonly logger?: ITelemetryBaseLogger,
	) {}

	public async supportsVersion(version: string): Promise<boolean> {
		return true;
	}

	public async createDetached(
		version: string,
	): Promise<{ container: IContainer; attach: () => Promise<string> }> {
		const documentId = uuid();
		const loader = new SimpleLoader({
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(documentId),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return loader.createDetached(version);
	}
	public async loadExisting(id: string): Promise<IContainer> {
		const documentId = id;
		const loader = new SimpleLoader({
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(documentId),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return loader.loadExisting(`${window.location.origin}/${id}`);
	}
}
