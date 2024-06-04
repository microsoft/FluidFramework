/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAudienceOwner } from "@fluidframework/container-definitions/internal";
import { ISequencedDocumentMessage, ISignalMessage } from "@fluidframework/driver-definitions";
import {
	IDocumentAttributes,
	IProcessMessageResult,
	ISignalClient,
	MessageType,
} from "@fluidframework/driver-definitions/internal";
import { canBeCoalescedByService } from "@fluidframework/driver-utils/internal";
import {
	IProtocolHandler as IBaseProtocolHandler,
	IQuorumSnapshot,
	ProtocolOpHandler,
} from "@fluidframework/protocol-base";

// ADO: #1986: Start using enum from protocol-base.
export enum SignalType {
	ClientJoin = "join", // same value as MessageType.ClientJoin,
	ClientLeave = "leave", // same value as MessageType.ClientLeave,
	Clear = "clear", // used only by client for synthetic signals
}

/**
 * Function to be used for creating a protocol handler.
 * @alpha
 */
export type ProtocolHandlerBuilder = (
	attributes: IDocumentAttributes,
	snapshot: IQuorumSnapshot,
	sendProposal: (key: string, value: any) => number,
) => IProtocolHandler;

/**
 * @alpha
 */
export interface IProtocolHandler extends IBaseProtocolHandler {
	readonly audience: IAudienceOwner;
	processSignal(message: ISignalMessage);
}

export class ProtocolHandler extends ProtocolOpHandler implements IProtocolHandler {
	constructor(
		attributes: IDocumentAttributes,
		quorumSnapshot: IQuorumSnapshot,
		sendProposal: (key: string, value: any) => number,
		public readonly audience: IAudienceOwner,
		private readonly shouldClientHaveLeft: (clientId: string) => boolean,
	) {
		super(
			attributes.minimumSequenceNumber,
			attributes.sequenceNumber,
			quorumSnapshot.members,
			quorumSnapshot.proposals,
			quorumSnapshot.values,
			sendProposal,
		);

		for (const [clientId, member] of this.quorum.getMembers()) {
			audience.addMember(clientId, member.client);
		}

		// Join / leave signals are ignored for "write" clients in favor of join / leave ops
		this.quorum.on("addMember", (clientId, details) =>
			audience.addMember(clientId, details.client),
		);
		this.quorum.on("removeMember", (clientId) => audience.removeMember(clientId));
		for (const [clientId, details] of this.quorum.getMembers()) {
			this.audience.addMember(clientId, details.client);
		}
	}

	public processMessage(
		message: ISequencedDocumentMessage,
		local: boolean,
	): IProcessMessageResult {
		// Check and report if we're getting messages from a clientId that we previously
		// flagged as shouldHaveLeft, or from a client that's not in the quorum but should be
		if (message.clientId != null) {
			const client = this.quorum.getMember(message.clientId);

			if (client === undefined && message.type !== MessageType.ClientJoin) {
				// pre-0.58 error message: messageClientIdMissingFromQuorum
				throw new Error("Remote message's clientId is missing from the quorum");
			}

			// Here checking canBeCoalescedByService is used as an approximation of "is benign to process despite being unexpected".
			// It's still not good to see these messages from unexpected clientIds, but since they don't harm the integrity of the
			// document we don't need to blow up aggressively.
			if (this.shouldClientHaveLeft(message.clientId) && !canBeCoalescedByService(message)) {
				// pre-0.58 error message: messageClientIdShouldHaveLeft
				throw new Error("Remote message's clientId already should have left");
			}
		}

		return super.processMessage(message, local);
	}

	public processSignal(message: ISignalMessage) {
		const innerContent = message.content as { content: any; type: string };
		switch (innerContent.type) {
			case SignalType.Clear: {
				const members = this.audience.getMembers();
				for (const [clientId, client] of members) {
					if (client.mode === "read") {
						this.audience.removeMember(clientId);
					}
				}
				break;
			}
			case SignalType.ClientJoin: {
				const newClient = innerContent.content as ISignalClient;
				// Ignore write clients - quorum will control such clients.
				if (newClient.client.mode === "read") {
					this.audience.addMember(newClient.clientId, newClient.client);
				}
				break;
			}
			case SignalType.ClientLeave: {
				const leftClientId = innerContent.content as string;
				// Ignore write clients - quorum will control such clients.
				if (this.audience.getMember(leftClientId)?.mode === "read") {
					this.audience.removeMember(leftClientId);
				}
				break;
			}
			default:
				break;
		}
	}
}

/**
 * Function to check whether the protocol handler should process the Signal.
 * The protocol handler should strictly handle only ClientJoin, ClientLeave
 * and Clear signal types.
 */
export function protocolHandlerShouldProcessSignal(message: ISignalMessage) {
	// Signal originates from server
	if (message.clientId === null) {
		const innerContent = message.content as { content: unknown; type: string };
		return (
			innerContent.type === SignalType.Clear ||
			innerContent.type === SignalType.ClientJoin ||
			innerContent.type === SignalType.ClientLeave
		);
	}
	return false;
}
