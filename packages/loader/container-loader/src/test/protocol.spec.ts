/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type IClientDetails, type IUser } from "@fluidframework/driver-definitions";
import {
	MessageType,
	type ISequencedDocumentMessage,
	type ISequencedDocumentSystemMessage,
	type IClientJoin,
} from "@fluidframework/driver-definitions/internal";

import { ProtocolOpHandler } from "../protocol/index.js";

/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

describe("Protocol", () => {
	let protocolOpHandler: ProtocolOpHandler;

	beforeEach(() => {
		protocolOpHandler = new ProtocolOpHandler(
			0 /* minimumSequenceNumber */,
			0 /* sequenceNumber */,
			[] /* members */,
			[] /* proposals */,
			[] /* values */,
			() => {
				return 0;
			} /* sendProposal */,
		);
	});

	describe("ProtocolOpHandler", () => {
		it("tracks sequence numbers", () => {
			const messages: ISequencedDocumentMessage[] = [
				{
					sequenceNumber: 1,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 1,
					type: MessageType.Operation,
					clientId: "test",
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 0,
				},
				{
					sequenceNumber: 2,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 2,
					type: MessageType.Operation,
					clientId: "test-2",
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 1,
				},
			];
			for (const message of messages) {
				assert.doesNotThrow(() => protocolOpHandler.processMessage(message, false));
			}
			assert.strictEqual(protocolOpHandler.attributes.sequenceNumber, 2);
		});

		it("throws when state not moving sequentially", () => {
			const messages: ISequencedDocumentMessage[] = [
				{
					sequenceNumber: 1,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 1,
					type: MessageType.Operation,
					clientId: "test",
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 0,
				},
				{
					sequenceNumber: 3,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 2,
					type: MessageType.Operation,
					clientId: "test-2",
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 1,
				},
			];
			assert.doesNotThrow(() => protocolOpHandler.processMessage(messages[0], false));
			assert.throws(() => protocolOpHandler.processMessage(messages[1], false));
		});

		it("scrubs user data from protocol state quorum", () => {
			const clientJoin1: IClientJoin = {
				clientId: "test",
				detail: {
					mode: "write",
					details: {} as IClientDetails,
					permission: [],
					user: {
						id: "test-user",
						name: "Test User",
						additionalDetails: { favoriteColor: "red" },
					} as IUser,
					scopes: [],
					timestamp: 0,
				},
			};
			const clientJoin2: IClientJoin = {
				clientId: "test-2",
				detail: {
					mode: "write",
					details: {} as IClientDetails,
					permission: [],
					user: {
						id: "test-user-2",
						name: "Test User2",
						additionalDetails: { favoriteColor: "blue" },
					} as IUser,
					scopes: [],
					timestamp: 0,
				},
			};
			const messages: ISequencedDocumentSystemMessage[] = [
				{
					sequenceNumber: 1,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 1,
					type: MessageType.ClientJoin,
					// API uses null
					// eslint-disable-next-line unicorn/no-null
					clientId: null,
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 0,
					data: JSON.stringify(clientJoin1),
				},
				{
					sequenceNumber: 2,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 2,
					type: MessageType.ClientJoin,
					// API uses null
					// eslint-disable-next-line unicorn/no-null
					clientId: null,
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 1,
					data: JSON.stringify(clientJoin2),
				},
			];
			for (const message of messages) {
				assert.doesNotThrow(() => protocolOpHandler.processMessage(message, false));
			}
			assert.strictEqual(protocolOpHandler.attributes.sequenceNumber, 2);

			const scrubbedProtocolState = protocolOpHandler.getProtocolState(true);
			for (const [, member] of scrubbedProtocolState.members) {
				assert(!member.client.user.id, "user id should be empty");
				assert(
					// TODO: use a real type
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					!(member.client.user as any).name,
					"user name should not be present",
				);
				assert(
					// TODO: use a real type
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					!(member.client.user as any).additionalDetails?.favoriteColor,
					"user additional details should not be present",
				);
			}
		});

		it("does not scrub user data from protocol state quorum", () => {
			const clientJoin1: IClientJoin = {
				clientId: "test",
				detail: {
					mode: "write",
					details: {} as IClientDetails,
					permission: [],
					user: {
						id: "test-user",
						name: "Test User",
						additionalDetails: { favoriteColor: "red" },
					} as IUser,
					scopes: [],
					timestamp: 0,
				},
			};
			const clientJoin2: IClientJoin = {
				clientId: "test-2",
				detail: {
					mode: "write",
					details: {} as IClientDetails,
					permission: [],
					user: {
						id: "test-user-2",
						name: "Test User2",
						additionalDetails: { favoriteColor: "blue" },
					} as IUser,
					scopes: [],
					timestamp: 0,
				},
			};
			const messages: ISequencedDocumentSystemMessage[] = [
				{
					sequenceNumber: 1,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 1,
					type: MessageType.ClientJoin,
					// API uses null
					// eslint-disable-next-line unicorn/no-null
					clientId: null,
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 0,
					data: JSON.stringify(clientJoin1),
				},
				{
					sequenceNumber: 2,
					minimumSequenceNumber: 1,
					clientSequenceNumber: 2,
					type: MessageType.ClientJoin,
					// API uses null
					// eslint-disable-next-line unicorn/no-null
					clientId: null,
					referenceSequenceNumber: 0,
					contents: "test content",
					timestamp: 1,
					data: JSON.stringify(clientJoin2),
				},
			];
			for (const message of messages) {
				assert.doesNotThrow(() => protocolOpHandler.processMessage(message, false));
			}
			assert.strictEqual(protocolOpHandler.attributes.sequenceNumber, 2);

			const scrubbedProtocolState = protocolOpHandler.getProtocolState(true);
			for (const [, member] of scrubbedProtocolState.members) {
				assert(!member.client.user.id, "user id should be empty");
				assert(
					// TODO: use a real type
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					!(member.client.user as any).name,
					"user name should not be present",
				);
				assert(
					// TODO: use a real type
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					!(member.client.user as any).additionalDetails?.favoriteColor,
					"user additional details should not be present",
				);
			}
			const protocolState = protocolOpHandler.getProtocolState();
			for (const [, member] of protocolState.members) {
				assert(member.client.user.id, "user id should be present");
				// TODO: use a real type
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				assert((member.client.user as unknown as any).name, "user name should be present");
				assert(
					// TODO: use a real type
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
					(member.client.user as unknown as any).additionalDetails?.favoriteColor,
					"user additional details should be present",
				);
			}
		});
	});
});

/* eslint-enable @typescript-eslint/strict-boolean-expressions */
/* eslint-enable @typescript-eslint/consistent-type-assertions */
