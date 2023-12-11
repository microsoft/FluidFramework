/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentAttributes,
	IClientJoin,
	ICommittedProposal,
	IProcessMessageResult,
	IProposal,
	IQuorum,
	ISequencedClient,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
	ISequencedProposal,
	MessageType,
} from "@fluidframework/protocol-definitions";
import { IQuorumSnapshot, Quorum } from "./quorum";

/**
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
		sendProposal: (key: string, value: any) => number,
	) {
		this._quorum = new Quorum(members, proposals, values, sendProposal);
	}

	public get attributes(): IDocumentAttributes {
		return {
			minimumSequenceNumber: this.minimumSequenceNumber,
			sequenceNumber: this.sequenceNumber,
		};
	}

	setConnectionState(connected: boolean, clientId: string | undefined) {
		this._quorum.setConnectionState(connected, clientId);
	}

	snapshot(): IQuorumSnapshot {
		return this._quorum.snapshot();
	}

	public close() {
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
			case MessageType.ClientJoin:
				const systemJoinMessage = message as ISequencedDocumentSystemMessage;
				const join = JSON.parse(systemJoinMessage.data) as IClientJoin;
				const member: ISequencedClient = {
					client: join.detail,
					sequenceNumber: systemJoinMessage.sequenceNumber,
				};
				this._quorum.addMember(join.clientId, member);
				break;

			case MessageType.ClientLeave:
				const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
				const clientId = JSON.parse(systemLeaveMessage.data) as string;
				this._quorum.removeMember(clientId);
				break;

			case MessageType.Propose:
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

			default:
		}

		// Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
		// want to move that logic to this class.
		this._quorum.updateMinimumSequenceNumber(message);

		return { immediateNoOp };
	}

	/**
	 * Gets the scribe protocol state
	 */
	public getProtocolState(): IScribeProtocolState {
		// return a new object every time
		// this ensures future state changes will not affect outside callers
		return {
			sequenceNumber: this.sequenceNumber,
			minimumSequenceNumber: this.minimumSequenceNumber,
			...this._quorum.snapshot(),
		};
	}
}
