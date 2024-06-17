/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { IClient } from "@fluidframework/driver-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { stub } from "sinon";

import { DefaultTokenProvider } from "../defaultTokenProvider.js";
import { R11sDocumentDeltaConnection } from "../documentDeltaConnection.js";
import { DocumentService } from "../documentService.js";
import { RouterliciousDocumentServiceFactory } from "../documentServiceFactory.js";

describe("DocumentService", () => {
	let documentService: DocumentService;
	let routerliciousDocumentServiceFactory: RouterliciousDocumentServiceFactory;
	let deltaConnection;
	let resolvedUrl;

	beforeEach(async () => {
		routerliciousDocumentServiceFactory = new RouterliciousDocumentServiceFactory(
			new DefaultTokenProvider("jwt"),
		);
		resolvedUrl = {
			type: "fluid",
			id: "id",
			url: "https://mock.url/tenantId/documentId",
			endpoints: {
				ordererUrl: "ordererUrl",
				storageUrl: "storageUrl",
				deltaStorageUrl: "deltaStorageUrl",
				deltaStreamUrl: "deltaStreamUrl",
			},
			tokens: {},
		};
		documentService = (await routerliciousDocumentServiceFactory.createDocumentService(
			resolvedUrl as IResolvedUrl,
		)) as DocumentService;

		deltaConnection = {
			clientId: "clientId",
			existing: true,
			initialClients: [],
			initialMessages: [],
			initialSignals: [],
			version: "1.0",
			mode: "write",
			claims: {
				documentId: "docId",
				exp: 0,
				iat: 0,
				scopes: [],
				tenantId: "ten",
				ver: "ver",
				user: {
					id: "id",
				},
			},
			serviceConfiguration: {
				blockSize: 100,
				maxMessageSize: 16000,
				summary: {
					minIdleTime: 0,
					maxIdleTime: 0,
					maxAckWaitTime: 0,
					maxOps: 100,
					maxTime: 10,
				},
			},
			dispose: (): void => {},
			disposed: false,
			submit: (): void => {},
			submitSignal: (): void => {},
			on: (): void => {},
			once: (): void => {},
		};
	});

	it("connectToDeltaStream() enables summarizeProtocolTree policy when enable_single_commit_summary is true", async () => {
		const client: IClient = {
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		};

		deltaConnection = {
			...deltaConnection,
			// getter for conneciton details emulating enable_single_commit_summary feature flag as true
			get details() {
				return { supportedFeatures: { enable_single_commit_summary: true } };
			},
		};

		const stubbedDeltaConnectionCreate = stub(R11sDocumentDeltaConnection, "create").callsFake(
			async () => deltaConnection as R11sDocumentDeltaConnection,
		);
		await documentService.connectToDeltaStream(client);
		assert.equal(documentService.policies?.summarizeProtocolTree, true);
		stubbedDeltaConnectionCreate.restore();
	});

	it("connectToDeltaStream() does not set summarizeProtocolTree policy when enable_single_commit_summary is false", async () => {
		const client: IClient = {
			mode: "read",
			details: { capabilities: { interactive: true } },
			permission: [],
			user: { id: "id" },
			scopes: [],
		};

		deltaConnection = {
			...deltaConnection,
			// getter for conneciton details emulating enable_single_commit_summary feature flag as false
			get details() {
				return { supportedFeatures: { enable_single_commit_summary: false } };
			},
		};

		const stubbedDeltaConnectionCreate = stub(R11sDocumentDeltaConnection, "create").callsFake(
			async () => deltaConnection as R11sDocumentDeltaConnection,
		);

		await documentService.connectToDeltaStream(client);
		assert.equal(documentService.policies?.summarizeProtocolTree, false);

		// Update the delta connection to emulate service enabling of enable_single_commit_summary flag on reconnection
		deltaConnection = {
			...deltaConnection,
			// getter for conneciton details emulating enable_single_commit_summary feature flag as false
			get details() {
				return { supportedFeatures: { enable_single_commit_summary: true } };
			},
		};

		// emulate reconneciton to see if the new updated value of enable_single_commit_summary is picked up.
		await documentService.connectToDeltaStream(client);
		assert.equal(documentService.policies?.summarizeProtocolTree, true);
		stubbedDeltaConnectionCreate.restore();
	});
});
