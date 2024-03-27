/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions";
import type { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver";
import { IDetachedModel, IModelLoader } from "./interfaces.js";
import { ModelLoader } from "./modelLoader.js";

class TinyliciousService {
	public readonly documentServiceFactory: IDocumentServiceFactory;
	public readonly urlResolver: IUrlResolver;

	constructor(tinyliciousPort?: number) {
		const tokenProvider = new InsecureTinyliciousTokenProvider();
		this.urlResolver = new InsecureTinyliciousUrlResolver(tinyliciousPort);
		this.documentServiceFactory = new RouterliciousDocumentServiceFactory(tokenProvider);
	}
}

/**
 * @internal
 */
export class TinyliciousModelLoader<ModelType> implements IModelLoader<ModelType> {
	private readonly tinyliciousService = new TinyliciousService();
	private readonly modelLoader = new ModelLoader<ModelType>({
		urlResolver: this.tinyliciousService.urlResolver,
		documentServiceFactory: this.tinyliciousService.documentServiceFactory,
		codeLoader: this.codeLoader,
		generateCreateNewRequest: createTinyliciousCreateNewRequest,
	});

	public constructor(private readonly codeLoader: ICodeDetailsLoader) {}

	public async supportsVersion(version: string): Promise<boolean> {
		return this.modelLoader.supportsVersion(version);
	}

	public async createDetached(version: string): Promise<IDetachedModel<ModelType>> {
		return this.modelLoader.createDetached(version);
	}
	public async loadExisting(id: string): Promise<ModelType> {
		return this.modelLoader.loadExisting(id);
	}
	public async loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType> {
		return this.modelLoader.loadExistingPaused(id, sequenceNumber);
	}
}
