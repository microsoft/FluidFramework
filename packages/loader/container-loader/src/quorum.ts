/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventForwarder, doIfNotDisposed } from "@fluidframework/common-utils";
import {
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
