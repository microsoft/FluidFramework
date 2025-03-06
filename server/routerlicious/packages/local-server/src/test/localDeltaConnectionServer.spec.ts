/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "@fluidframework/server-common-utils";
import {
	ConnectionMode,
	IClient,
	IConnected,
	IDocumentMessage,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
	ITokenClaims,
	IUser,
	MessageType,
	ScopeType,
} from "@fluidframework/protocol-definitions";
import { IWebSocket } from "@fluidframework/server-services-core";
import { KJUR as jsrsasign } from "jsrsasign";
import { TestNotImplementedDocumentRepository } from "@fluidframework/server-test-utils";
import Sinon from "sinon";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "../localDeltaConnectionServer";

describe("LocalDeltaConnectionServer", () => {
	let deltaConnectionServer: ILocalDeltaConnectionServer;

	// Function to connect a new client in the given mode.
	function connectNewClient(
		mode: ConnectionMode,
		userId: string,
	): [IWebSocket, Promise<IConnected>] {
		const user: IUser = { id: userId };
		const client: IClient = {
			details: { capabilities: { interactive: true } },
			mode,
			permission: [],
			scopes: [],
			user,
		};

		const now = Math.round(new Date().getTime() / 1000);

		const claims: ITokenClaims = {
			documentId: "document",
			scopes: [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite],
			tenantId: "tenant",
			user,
			iat: now,
			exp: now + 60 * 60,
			ver: "1.0",
		};

		const utf8Key = { utf8: "key" };
		const token = jsrsasign.jws.JWS.sign(
			null,
			JSON.stringify({ alg: "HS256", typ: "JWT" }),
			claims,
			utf8Key,
		);

		return deltaConnectionServer.connectWebSocket("tenant", "document", token, client, [
			"^0.4.0",
		]);
	}

	// Function to add a handler that listens for "join" message on the given socket. It returns a promise that
	// will be resolved with the join message's data.
	async function addJoinHandler(socket: IWebSocket): Promise<any> {
		const joinP = new Deferred<any>();

		const joinHandler = (msgs: ISequencedDocumentSystemMessage[]) => {
			for (const msg of msgs) {
				if (joinP.isCompleted === false) {
					if (msg.type !== MessageType.ClientJoin) {
						joinP.reject(`expected join msg:\n${JSON.stringify(msg, undefined, 1)}`);
					} else {
						joinP.resolve(JSON.parse(msg.data));
					}
				}
			}
		};

		socket.on("op", (id: string, msgs: ISequencedDocumentSystemMessage[]) => joinHandler(msgs));

		return joinP.promise;
	}

	// Function to add a handler that listens for "op" message on the given socket. It returns a promise that
	// will be resolved with the op's contents. It will reject if the socket is disconnected.
	async function addMessagehandler(socket: IWebSocket): Promise<any> {
		const messageP = new Deferred<any>();

		const messageHandler = (msgs: ISequencedDocumentMessage[]) => {
			for (const msg of msgs) {
				if (messageP.isCompleted === false) {
					if (msg.type === MessageType.Operation) {
						messageP.resolve(msg.contents);
					}
				}
			}
		};

		socket.on("op", (id: string, msgs: ISequencedDocumentMessage[]) => messageHandler(msgs));

		socket.on("disconnect", () => messageP.reject("socket was disconnected"));

		return messageP.promise;
	}

	beforeEach(() => {
		const testDocumentRepository = new TestNotImplementedDocumentRepository();
		Sinon.replace(testDocumentRepository, "updateOne", Sinon.fake.resolves(undefined));
		deltaConnectionServer = LocalDeltaConnectionServer.create(
			undefined,
			undefined,
			testDocumentRepository,
		);
	});

	afterEach(async () => {
		await deltaConnectionServer.close();
	});

	it("can connect to web socket and join client", async () => {
		// Connect the first client.
		const [socket1, connected1P] = connectNewClient("write", "userId1");

		// Add a handler to listen for join message on the first client.
		const join1P = addJoinHandler(socket1);

		// Wait for the first client to be connected and joined.
		const connected1 = await connected1P;
		assert.equal(
			connected1.existing,
			true,
			"The document should be existing for the first client",
		);

		const join1 = await join1P;
		assert.equal(
			connected1.clientId,
			join1.clientId,
			"The clientId in the join message should be same as the one in connected message",
		);

		// Connect the second client
		const [socket2, connected2P] = connectNewClient("write", "userId2");

		// Add a handler to listen for join message on the second client.
		const join2P = addJoinHandler(socket2);

		// Wait for the second client to be connected and joined.
		const connected2 = await connected2P;
		assert.equal(
			connected2.existing,
			true,
			"The document should be existing for the second client",
		);

		const join2 = await join2P;
		assert.equal(
			connected2.clientId,
			join2.clientId,
			"The clientId in the join message should be same as the one in connected message",
		);

		assert.notEqual(
			connected2.clientId,
			connected1.clientId,
			"The clientIds for the two clients should be different",
		);

		socket1.disconnect();
		socket2.disconnect();
	});

	it("can send and receive ops on client in write mode", async () => {
		// Connect the first client.
		const [socket1, connected1P] = connectNewClient("write", "userId1");

		// Add a handler to listen for join message on the first client.
		const join1P = addJoinHandler(socket1);

		// Wait for the first client to be connected and joined.
		const connected1 = await connected1P;
		assert.equal(
			connected1.mode,
			"write",
			"The first client should be connected in write mode",
		);

		await join1P;

		// Connect the second client.
		const [socket2, connected2P] = connectNewClient("write", "userId2");

		// Add a handler to listen for join message on the first client.
		const join2P = addJoinHandler(socket2);

		// Wait for the second client to be connected and joined.
		const connected2 = await connected2P;
		assert.equal(
			connected2.mode,
			"write",
			"The second client should be connected in write mode",
		);

		await join2P;

		// Send a message of type "MessageType.Operation" on the second client's socket.
		const content = "writeModeClient";
		const message: IDocumentMessage = {
			clientSequenceNumber: 1,
			contents: content,
			metadata: undefined,
			referenceSequenceNumber: 0,
			traces: [],
			type: MessageType.Operation,
		};
		socket2.emit("submitOp", connected2.clientId, [message]);

		// Add message handlers on both the clients that listen for ops of type "MessageType.Operation".
		const message1P = addMessagehandler(socket1);
		const message2P = addMessagehandler(socket2);

		// Verify that the first client receives the message with the right content.
		const content1 = await message1P;
		assert.equal(content1, content, "The content received on first client is not as expected");

		// Verify that the second client receives the message with the right content.
		const content2 = await message2P;
		assert.equal(content2, content, "The content received on second client is not as expected");

		socket1.disconnect();
		socket2.disconnect();
	});

	it("can receive ops on client in read mode", async () => {
		// Connect the first client in "write" mode.
		const [socket1, connected1P] = connectNewClient("write", "userId1");

		// Add a handler to listen for join message on the first client.
		const join1P = addJoinHandler(socket1);

		// Wait for the first client to be connected and joined.
		const connected1 = await connected1P;
		assert.equal(
			connected1.mode,
			"write",
			"The first client should be connected in write mode",
		);

		await join1P;

		// Connect the second client in "read" mode.
		const [socket2, connected2P] = connectNewClient("read", "userId2");

		// Wait for the second client to be connected. It won't join because it is read-only.
		const connected2 = await connected2P;
		assert.equal(connected2.mode, "read", "The second client should be connected in read mode");

		// Send a message of type "MessageType.Operation" on the first client's socket.
		const content = "readModeClient";
		const message: IDocumentMessage = {
			clientSequenceNumber: 1,
			contents: content,
			metadata: undefined,
			referenceSequenceNumber: 0,
			traces: [],
			type: MessageType.Operation,
		};
		socket1.emit("submitOp", connected1.clientId, [message]);

		// Add message handlers on both the clients that listen for ops of type "MessageType.Operation".
		const message1P = addMessagehandler(socket1);
		const message2P = addMessagehandler(socket2);

		// Verify that the first client in "read" mdoe receives the message with the right content.
		const content1 = await message1P;
		assert.equal(content1, content, "The content received on first client is not as expected");

		// Verify that the second client receives the message with the right content.
		const content2 = await message2P;
		assert.equal(content2, content, "The content received on second client is not as expected");

		socket1.disconnect();
		socket2.disconnect();
	});

	it("disconnects on message over 1mb", async () => {
		const [socket1, connected1P] = connectNewClient("write", "userId1");
		const join1P = addJoinHandler(socket1);

		await join1P;

		// Wait for the first client to be connected and joined.
		const connected1 = await connected1P;
		assert.equal(
			connected1.mode,
			"write",
			"The first client should be connected in write mode",
		);

		const message1P = addMessagehandler(socket1);

		const content = new Array(1e6).join("0");
		const message: IDocumentMessage = {
			clientSequenceNumber: 1,
			contents: content,
			metadata: undefined,
			referenceSequenceNumber: 0,
			traces: [],
			type: MessageType.Operation,
		};
		socket1.emit("submitOp", connected1.clientId, [message]);
		try {
			await message1P;
		} catch (error) {
			assert.equal(error, "socket was disconnected");
		}
	});
});
