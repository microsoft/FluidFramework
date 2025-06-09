/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPubSub, LocalOrderer } from "@fluidframework/server-memory-orderer";
import { GitManager, IHistorian } from "@fluidframework/server-services-client";
import {
	CheckpointService,
	ICheckpointRepository,
	IDatabaseManager,
	IDocumentRepository,
	IDocumentStorage,
	ILogger,
	IOrderer,
	IOrdererManager,
	IServiceConfiguration,
	MongoCheckpointRepository,
	MongoDocumentRepository,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class LocalOrdererManager implements IOrdererManager {
	/**
	 * Map of "tenantId/documentId" to the orderer for that document.
	 */
	private readonly ordererMap = new Map<string, Promise<IOrderer>>();

	constructor(
		private readonly storage: IDocumentStorage,
		private readonly databaseManager: IDatabaseManager,
		private readonly createHistorian: (tenant: string) => Promise<IHistorian>,
		private readonly logger: ILogger,
		private readonly serviceConfiguration?: Partial<IServiceConfiguration>,
		private readonly pubsub?: IPubSub,
		private readonly documentRepository?: IDocumentRepository,
		private readonly checkpointRepository?: ICheckpointRepository,
	) {}

	/**
	 * Closes all local orderers
	 */
	public async close() {
		await Promise.all(
			Array.from(this.ordererMap.values()).map(async (orderer) => (await orderer).close()),
		);
		this.ordererMap.clear();
	}

	/**
	 * Returns true if there are any received ops that are not yet ordered.
	 */
	public async hasPendingWork(): Promise<boolean> {
		return Promise.all(this.ordererMap.values()).then((orderers) => {
			for (const orderer of orderers) {
				// We know that it ia LocalOrderer, break the abstraction
				if ((orderer as LocalOrderer).hasPendingWork()) {
					return true;
				}
			}
			return false;
		});
	}

	public async getOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
		const key = this.getOrdererMapKey(tenantId, documentId);

		let orderer = this.ordererMap.get(key);
		if (orderer === undefined) {
			orderer = this.createLocalOrderer(tenantId, documentId);
			this.ordererMap.set(key, orderer);
		}

		return orderer;
	}

	private async createLocalOrderer(tenantId: string, documentId: string): Promise<IOrderer> {
		const historian = await this.createHistorian(tenantId);
		const gitManager = new GitManager(historian);
		const documentRepository =
			this.documentRepository ??
			new MongoDocumentRepository(await this.databaseManager.getDocumentCollection());
		const deliCheckpointRepository =
			this.checkpointRepository ??
			new MongoCheckpointRepository(
				await this.databaseManager.getCheckpointCollection(),
				"deli",
			);

		const scribeCheckpointRepository =
			this.checkpointRepository ??
			new MongoCheckpointRepository(
				await this.databaseManager.getCheckpointCollection(),
				"scribe",
			);

		const deliCheckpointService = new CheckpointService(
			deliCheckpointRepository,
			documentRepository,
			false,
		);
		const scribeCheckpointService = new CheckpointService(
			scribeCheckpointRepository,
			documentRepository,
			false,
		);

		const orderer = await LocalOrderer.load(
			this.storage,
			this.databaseManager,
			tenantId,
			documentId,
			this.logger,
			documentRepository,
			deliCheckpointRepository,
			scribeCheckpointRepository,
			deliCheckpointService,
			scribeCheckpointService,
			gitManager,
			undefined /* ILocalOrdererSetup */,
			this.pubsub,
			undefined /* broadcasterContext */,
			undefined /* scriptoriumContext */,
			undefined /* scribeContext */,
			undefined /* deliContext */,
			undefined /* moiraContext */,
			this.serviceConfiguration,
		);

		const lambdas = [
			orderer.broadcasterLambda,
			orderer.deliLambda,
			orderer.scribeLambda,
			orderer.scriptoriumLambda,
		];
		await Promise.all(
			lambdas.map(async (lambda) => {
				if (lambda === undefined) {
					throw new Error("We expect lambdas to be defined by now.");
				}
				if (lambda.state === "created") {
					return new Promise<void>((resolve) => lambda.once("started", () => resolve()));
				}
			}),
		);

		return orderer;
	}

	public async removeOrderer(tenantId: string, documentId: string): Promise<void> {
		// No-op for local orderer. Orderer connections are managed separately.
	}

	private getOrdererMapKey(tenantId: string, documentId: string) {
		return `${tenantId}/${documentId}`;
	}
}
