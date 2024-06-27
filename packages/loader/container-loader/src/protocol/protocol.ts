/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedClient } from "@fluidframework/driver-definitions";
import {
	ISequencedDocumentMessage,
	IDocumentAttributes,
	IClientJoin,
	ICommittedProposal,
	IProcessMessageResult,
	IProposal,
	IQuorum,
	ISequencedDocumentSystemMessage,
	ISequencedProposal,
	MessageType,
} from "@fluidframework/driver-definitions/internal";

import { IQuorumSnapshot, Quorum } from "./quorum.js";

/**
 * @legacy
 * @alpha
 */
export interface IScribeProtocolState {
	sequenceNumber: number;
	minimumSequenceNumber: number;
	members: [string, ISequencedClient][];
	proposals: [number, ISequencedProposal, string[]][];
	values: [string, ICommittedProposal][];
}

/**
 * @legacy
 * @alpha
 */
export interface IProtocolHandler {
	readonly quorum: IQuorum;
	readonly attributes: IDocumentAttributes;

	setConnectionState(connected: boolean, clientId: string | undefined);
	snapshot(): IQuorumSnapshot;

	close(): void;
	processMessage(message: ISequencedDocumentMessage, local: boolean): IProcessMessageResult;
	getProtocolState(): IScribeProtocolState;
}

/**
 * Handles protocol specific ops.
 * @internal
 */
export class ProtocolOpHandler implements IProtocolHandler {
	private readonly _quorum: Quorum;
	public get quorum(): Quorum {
		return this._quorum;
	}

	constructor(
		public minimumSequenceNumber: number,
		public sequenceNumber: number,
		members: [string, ISequencedClient][],
		proposals: [number, ISequencedProposal, string[]][],
		values: [string, ICommittedProposal][],
		sendProposal: (key: string, value: unknown) => number,
	) {
		this._quorum = new Quorum(members, proposals, values, sendProposal);
	}

	public get attributes(): IDocumentAttributes {
		return {
			minimumSequenceNumber: this.minimumSequenceNumber,
			sequenceNumber: this.sequenceNumber,
		};
	}

	setConnectionState(connected: boolean, clientId: string | undefined): void {
		this._quorum.setConnectionState(connected, clientId);
	}

	snapshot(): IQuorumSnapshot {
		return this._quorum.snapshot();
	}

	public close(): void {
		this._quorum.close();
	}

	public processMessage(
		message: ISequencedDocumentMessage,
		local: boolean,
	): IProcessMessageResult {
		// verify it's moving sequentially
		if (message.sequenceNumber !== this.sequenceNumber + 1) {
			throw new Error(
				`Protocol state is not moving sequentially. ` +
					`Current is ${this.sequenceNumber}. Next is ${message.sequenceNumber}`,
			);
		}

		// Update tracked sequence numbers
		this.sequenceNumber = message.sequenceNumber;
		this.minimumSequenceNumber = message.minimumSequenceNumber;

		let immediateNoOp = false;

		switch (message.type) {
			case MessageType.ClientJoin: {
				const systemJoinMessage = message as ISequencedDocumentSystemMessage;
				const join = JSON.parse(systemJoinMessage.data) as IClientJoin;
				const member: ISequencedClient = {
					client: join.detail,
					sequenceNumber: systemJoinMessage.sequenceNumber,
				};
				this._quorum.addMember(join.clientId, member);
				break;
			}

			case MessageType.ClientLeave: {
				const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
				const clientId = JSON.parse(systemLeaveMessage.data) as string;
				this._quorum.removeMember(clientId);
				break;
			}

			case MessageType.Propose: {
				// back-compat: ADO #1385: This should become unconditional eventually.
				// Can be done only after Container.processRemoteMessage() stops parsing content!
				if (typeof message.contents === "string") {
					message.contents = JSON.parse(message.contents);
				}
				const proposal = message.contents as IProposal;
				this._quorum.addProposal(
					proposal.key,
					proposal.value,
					message.sequenceNumber,
					local,
					message.clientSequenceNumber,
				);

				// On a quorum proposal, immediately send a response to expedite the approval.
				immediateNoOp = true;
				break;
			}

			default:
		}

		// Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
		// want to move that logic to this class.
		this._quorum.updateMinimumSequenceNumber(message);

		return { immediateNoOp };
	}

	/**
	 * Gets the scribe protocol state
	 * @param scrubUserData - whether to remove all user data from the quorum members. CAUTION: this will corrupt the quorum if used in a summary.
	 */
	public getProtocolState(scrubUserData = false): IScribeProtocolState {
		// return a new object every time
		// this ensures future state changes will not affect outside callers
		const snapshot = this._quorum.snapshot();

		if (scrubUserData) {
			// In place, remove any identifying client information
			snapshot.members = snapshot.members.map(([id, sequencedClient]) => [
				id,
				{
					...sequencedClient,
					client: {
						...sequencedClient.client,
						user: { id: "" },
					},
				},
			]);
		}

		return {
			sequenceNumber: this.sequenceNumber,
			minimumSequenceNumber: this.minimumSequenceNumber,
			...snapshot,
		};
	}
}
