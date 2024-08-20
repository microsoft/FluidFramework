/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICodeDetailsLoader } from "@fluidframework/container-definitions/internal";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver/internal";

import type {
	IAttachedMigratableModel,
	IDetachedMigratableModel,
	IMigratableModelLoader,
} from "./interfaces.js";
import { MigratableModelLoader } from "./migratableModelLoader.js";

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
 * @alpha
 */
export class MigratableTinyliciousModelLoader<ModelType>
	implements IMigratableModelLoader<ModelType>
{
	private readonly tinyliciousService = new TinyliciousService();
	private readonly modelLoader: MigratableModelLoader<ModelType>;

	public constructor(codeLoader: ICodeDetailsLoader) {
		this.modelLoader = new MigratableModelLoader<ModelType>({
			urlResolver: this.tinyliciousService.urlResolver,
			documentServiceFactory: this.tinyliciousService.documentServiceFactory,
			codeLoader,
			generateCreateNewRequest: createTinyliciousCreateNewRequest,
		});
	}

	public async supportsVersion(version: string): Promise<boolean> {
		return this.modelLoader.supportsVersion(version);
	}

	public async createDetached(version: string): Promise<IDetachedMigratableModel<ModelType>> {
		return this.modelLoader.createDetached(version);
	}
	public async loadExisting(id: string): Promise<IAttachedMigratableModel<ModelType>> {
		return this.modelLoader.loadExisting(id);
	}
	public async loadExistingPaused(
		id: string,
		sequenceNumber: number,
	): Promise<IAttachedMigratableModel<ModelType>> {
		return this.modelLoader.loadExistingPaused(id, sequenceNumber);
	}
}
