/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { LocalOrdererManager } from "@fluidframework/server-local-server";
import { DocumentStorage } from "@fluidframework/server-services-shared";
import { Historian } from "@fluidframework/server-services-client";
import {
	MongoDatabaseManager,
	MongoManager,
	IResourcesFactory,
	MongoDocumentRepository,
} from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import { Server } from "socket.io";

import winston from "winston";
import { TinyliciousResources } from "./resources";
import {
	PubSubPublisher,
	TenantManager,
	getDbFactory,
	WebServerFactory,
	StorageNameAllocator,
} from "./services";

const defaultTinyliciousPort = 7070;

export class TinyliciousResourcesFactory implements IResourcesFactory<TinyliciousResources> {
	public async create(
		config: Provider,
		customizations?: Record<string, any>,
	): Promise<TinyliciousResources> {
		const globalDbEnabled = false;
		// Pull in the default port off the config
		const port = utils.normalizePort(process.env.PORT ?? defaultTinyliciousPort);
		const collectionNames = config.get("mongo:collectionNames");

		const tenantManager = new TenantManager(`http://localhost:${port}`);
		const storageNameAllocator = new StorageNameAllocator(tenantManager);
		const dbFactory = await getDbFactory(config);

		const mongoManager = new MongoManager(dbFactory);
		const databaseManager = new MongoDatabaseManager(
			globalDbEnabled,
			mongoManager,
			mongoManager,
			collectionNames.nodes,
			collectionNames.documents,
			collectionNames.checkpoints,
			collectionNames.deltas,
			collectionNames.scribeDeltas,
		);
		const documentsCollection = await databaseManager.getDocumentCollection();
		const documentRepository =
			customizations?.documentRepository ?? new MongoDocumentRepository(documentsCollection);

		const opsCollection = await databaseManager.getDeltaCollection(undefined, undefined);

		const storage = new DocumentStorage(
			documentRepository,
			tenantManager,
			false,
			opsCollection,
			storageNameAllocator,
		);
		const io = new Server({
			// enable compatibility with socket.io v2 clients
			// https://socket.io/docs/v4/client-installation/
			allowEIO3: true,
		});
		const pubsub = new PubSubPublisher(io);
		const webServerFactory = new WebServerFactory(io);

		// This produces a static object with the merged settings from all the stores in the nconf Provider.
		// It includes env variables that we probably don't need to pass to the LocalOrderManager, but small price to pay
		// so we can apply configuration to the lambdas from the tinylicious config file.
		// Note: using a Proxy doesn't work because this gets eventually lodash-merge()d with other objects, and that looks
		// for the actual properties of an object, which won't trigger get() calls on the Proxy that we can forward to the
		// nconf Provider.
		const frozenConfig = config.get();

		const orderManager = new LocalOrdererManager(
			storage,
			databaseManager,
			async (tenantId: string) => {
				const url = `http://localhost:${port}/repos/${encodeURIComponent(tenantId)}`;
				return new Historian(url, false, false);
			},
			winston,
			frozenConfig,
			pubsub,
		);

		const collaborationSessionEventEmitter =
			// eslint-disable-next-line import/no-deprecated
			new TypedEventEmitter<ICollaborationSessionEvents>();

		return new TinyliciousResources(
			config,
			orderManager,
			tenantManager,
			storage,
			mongoManager,
			port,
			webServerFactory,
			collaborationSessionEventEmitter,
		);
	}
}
