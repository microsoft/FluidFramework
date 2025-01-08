/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorage } from "@fluidframework/server-services-core";
import {
	defaultHash,
	convertFirstSummaryWholeSummaryTreeToSummaryTree,
} from "@fluidframework/server-services-client";
import { Router } from "express";
import { v4 as uuid } from "uuid";
import winston from "winston";

export function create(storage: IDocumentStorage): Router {
	const router: Router = Router();

	router.get("/:tenantId?/:id", (request, response) => {
		const tenantId = request.params.tenantId ?? "fluid";
		const documentId = request.params.id;
		const documentP = storage.getDocument(tenantId, documentId);
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
		const tenantId = request.params.tenantId;
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
			false /* enableDiscovery */,
			false /* isEphemeralContainer */,
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

	return router;
}
