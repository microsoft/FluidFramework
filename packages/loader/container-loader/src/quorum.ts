/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, EventForwarder, doIfNotDisposed } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
	ICommittedProposal,
	IQuorumClients,
	IQuorumClientsEvents,
	ISequencedClient,
} from "@fluidframework/protocol-definitions";

/**
 * Proxies Quorum events.
 */
export class QuorumProxy extends EventForwarder<IQuorumClientsEvents> implements IQuorumClients {
	public readonly getMembers: () => Map<string, ISequencedClient>;
	public readonly getMember: (clientId: string) => ISequencedClient | undefined;

	constructor(quorum: IQuorumClients) {
		super(quorum);

		// This is heavily used object, increase limit at which Node prints warnings.
		super.setMaxListeners(50);

		this.getMembers = doIfNotDisposed(this, quorum.getMembers.bind(quorum));
		this.getMember = doIfNotDisposed(this, quorum.getMember.bind(quorum));
	}
}

export function getCodeDetailsFromQuorumValues(
	quorumValues: [string, ICommittedProposal][],
): IFluidCodeDetails {
	const qValuesMap = new Map(quorumValues);
	const proposal = qValuesMap.get("code");
	assert(proposal !== undefined, 0x2dc /* "Cannot find code proposal" */);
	return proposal?.value as IFluidCodeDetails;
}

export function initQuorumValuesFromCodeDetails(
	source: IFluidCodeDetails,
): [string, ICommittedProposal][] {
	// Seed the base quorum to be an empty list with a code quorum set
	const committedCodeProposal: ICommittedProposal = {
		key: "code",
		value: source,
		approvalSequenceNumber: 0,
		commitSequenceNumber: 0,
		sequenceNumber: 0,
	};
	return [["code", committedCodeProposal]];
}
