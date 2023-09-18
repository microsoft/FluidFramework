/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IBroadcastSignalEventPayload,
	ICollaborationSessionEvents,
	IRoom,
} from "@fluidframework/server-lambdas";
import { IDocumentStorage } from "@fluidframework/server-services-core";
import {
	defaultHash,
	convertFirstSummaryWholeSummaryTreeToSummaryTree,
} from "@fluidframework/server-services-client";
import { Router } from "express";
import { v4 as uuid } from "uuid";
import winston from "winston";
import { getParam } from "../../utils";

export function create(
	storage: IDocumentStorage,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
): Router {
	const router: Router = Router();

	router.get("/:tenantId?/:id", (request, response) => {
		const documentP = storage.getDocument(
			getParam(request.params, "tenantId"),
			getParam(request.params, "id"),
		);
		documentP.then(
			(document) => {
				response.status(200).json(document);
			},
			(error) => {
				response.status(400).json(error);
			},
		);
	});

	/**
	 * Creates a new document with initial summary.
	 */
	router.post("/:tenantId", (request, response, next) => {
		// Tenant and document
		const tenantId = getParam(request.params, "tenantId");
		const id = request.body.id || uuid();

		// Summary information
		const summary = request.body.enableAnyBinaryBlobOnFirstSummary
			? convertFirstSummaryWholeSummaryTreeToSummaryTree(request.body.summary)
			: request.body.summary;

		winston.info(`SummaryTree converted = ${request.body.enableAnyBinaryBlobOnFirstSummary}.`);
		// Protocol state
		const sequenceNumber = request.body.sequenceNumber;
		const values = request.body.values;

		const createP = storage.createDocument(
			tenantId,
			id,
			summary,
			sequenceNumber,
			defaultHash,
			`http://${request.hostname}`,
			`http://${request.hostname}`,
			`http://${request.hostname}`,
			values,
			false,
		);

		createP.then(
			() => {
				response.status(201).json(id);
			},
			(error) => {
				response.status(400).json(error);
			},
		);
	});

	/**
	 * Passes on content to all clients in a collaboration session happening on the document via means of signal.
	 */
	router.post("/:tenantId/:id/broadcast-signal", (request, response) => {
		const tenantId = getParam(request.params, "tenantId");
		const documentId = getParam(request.params, "id");
		const signalContent = getParam(request.body, "signalContent");
		const documentP = storage.getDocument(
			getParam(request.params, "tenantId"),
			getParam(request.params, "id"),
		);
		documentP.then(
			(_document: any) => {
				try {
					const signalRoom: IRoom = { tenantId, documentId };
					const payload: IBroadcastSignalEventPayload = { signalRoom, signalContent };
					collaborationSessionEventEmitter.emit("broadcast-signal", payload);
					response.status(200).send("OK");
				} catch (error) {
					response.status(500).send(error);
				}
			},
			(error) => {
				response.status(400).json(error);
			},
		);
	});

	return router;
}
