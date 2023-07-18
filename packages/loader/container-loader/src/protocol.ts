/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAudienceOwner } from "@fluidframework/container-definitions";
import {
	IProtocolHandler as IBaseProtocolHandler,
	IQuorumSnapshot,
	ProtocolOpHandler,
} from "@fluidframework/protocol-base";
import {
	IDocumentAttributes,
	ISignalClient,
	ISignalMessage,
} from "@fluidframework/protocol-definitions";

// "term" was an experimental feature that is being removed.  The only safe value to use is 1.
export const OnlyValidTermValue = 1 as const;

// ADO: #1986: Start using enum from protocol-base.
export enum SignalType {
	ClientJoin = "join", // same value as MessageType.ClientJoin,
	ClientLeave = "leave", // same value as MessageType.ClientLeave,
	Clear = "clear", // used only by client for synthetic signals
}

/**
 * Function to be used for creating a protocol handler.
 */
export type ProtocolHandlerBuilder = (
	attributes: IDocumentAttributes,
	snapshot: IQuorumSnapshot,
	sendProposal: (key: string, value: any) => number,
) => IProtocolHandler;

export interface IProtocolHandler extends IBaseProtocolHandler {
	readonly audience: IAudienceOwner;
	processSignal(message: ISignalMessage);
}

export class ProtocolHandler extends ProtocolOpHandler implements IProtocolHandler {
	constructor(
		attributes: IDocumentAttributes,
		quorumSnapshot: IQuorumSnapshot,
		sendProposal: (key: string, value: any) => number,
		readonly audience: IAudienceOwner,
	) {
		super(
			attributes.minimumSequenceNumber,
			attributes.sequenceNumber,
			quorumSnapshot.members,
			quorumSnapshot.proposals,
			quorumSnapshot.values,
			sendProposal,
		);

		// Join / leave signals are ignored for "write" clients in favor of join / leave ops
		this.quorum.on("addMember", (clientId, details) =>
			audience.addMember(clientId, details.client),
		);
		this.quorum.on("removeMember", (clientId) => audience.removeMember(clientId));
		for (const [clientId, details] of this.quorum.getMembers()) {
			this.audience.addMember(clientId, details.client);
		}
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
