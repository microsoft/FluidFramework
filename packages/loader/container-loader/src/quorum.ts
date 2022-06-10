/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, EventForwarder, doIfNotDisposed } from "@fluidframework/common-utils";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
    ICommittedProposal,
    IQuorum,
    IQuorumEvents,
    ISequencedClient,
} from "@fluidframework/protocol-definitions";

/**
 * Proxies Quorum events.
 */
export class QuorumProxy extends EventForwarder<IQuorumEvents> implements IQuorum {
    public readonly propose: (key: string, value: any) => Promise<void>;
    public readonly has: (key: string) => boolean;
    public readonly get: (key: string) => any;
    public readonly getMembers: () => Map<string, ISequencedClient>;
    public readonly getMember: (clientId: string) => ISequencedClient | undefined;

    constructor(quorum: IQuorum) {
        super(quorum);

        // This is heavily used object, increase limit at which Node prints warnings.
        super.setMaxListeners(50);

        this.propose = doIfNotDisposed(this, quorum.propose.bind(quorum));
        this.has = doIfNotDisposed(this, quorum.has.bind(quorum));
        this.get = doIfNotDisposed(this, quorum.get.bind(quorum));
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
