/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IBroadcastSignalEventPayload,
	ICollaborationSessionEvents,
	IRoom,
} from "@fluidframework/server-lambdas";
import { IDocumentStorage, MongoManager } from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { getParam } from "../../utils";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
	config: Provider,
	storage: IDocumentStorage,
	mongoManager: MongoManager,
	// eslint-disable-next-line import/no-deprecated
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
): Router {
	const router: Router = Router();
	const deltasRoute = deltas.create(config, mongoManager);
	const documentsRoute = documents.create(storage);

	router.use("/deltas", deltasRoute);
	router.use("/documents", documentsRoute);

	/**
	 * Passes on content to all clients in a collaboration session happening on the document via means of signal.
	 */
	router.post("/:tenantId/:id/broadcast-signal", (request, response) => {
		const tenantId = getParam(request.params, "tenantId");
		const documentId = getParam(request.params, "id");
		// This endpoint simply passes on signalContent as a blackbox so we don't
		// do any validation on it here
		const signalContent = getParam(request.body, "signalContent");

		try {
			const signalRoom: IRoom = { tenantId, documentId };
			const payload: IBroadcastSignalEventPayload = { signalRoom, signalContent };
			collaborationSessionEventEmitter?.emit("broadcastSignal", payload);
			response.status(200).send("OK");
		} catch (error) {
			response.status(500).send(error);
		}
	});

	return router;
}
