/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ICodeDetailsLoader,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
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

const localServer = LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());

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
		const loader = new SimpleLoader({
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(uuid()),
		});
		return loader.createDetached(version);
	}
	public async loadExisting(id: string): Promise<IContainer> {
		const loader = new SimpleLoader({
			urlResolver,
			documentServiceFactory: new LocalDocumentServiceFactory(localServer),
			codeLoader: this.codeLoader,
			logger: this.logger,
			generateCreateNewRequest: () => createLocalResolverCreateNewRequest(uuid()),
		});
		return loader.loadExisting(`${window.location.origin}/${id}`);
	}
}
