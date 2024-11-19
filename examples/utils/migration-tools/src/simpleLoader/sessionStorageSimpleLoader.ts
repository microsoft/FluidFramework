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
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { v4 as uuid } from "uuid";

import type { ISimpleLoader } from "./interfaces.js";
import { SimpleLoader } from "./simpleLoader.js";

const urlResolver = new LocalResolver();

const deltaConnection = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
const getDocumentServiceFactory = (): IDocumentServiceFactory => {
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
			documentServiceFactory: getDocumentServiceFactory(),
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
			documentServiceFactory: getDocumentServiceFactory(),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(documentId),
		});
		return loader.loadExisting(`${window.location.origin}/${id}`);
	}
}
