/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
// eslint-disable-next-line import/no-extraneous-dependencies
import {
    IQuorum,
} from "@microsoft/fluid-protocol-definitions";

const currentCodeProposalKey = "code";

function createProposeOnceFunc(quorum: IQuorum, pkgForCodeProposal: IFluidCodeDetails) {
    let proposalP;
    let done = false;
    return async () => {

        if (done) {
            return done;
        }

        if (proposalP !== undefined) {
            await proposalP;
            return done;
        }

        proposalP = quorum.propose(currentCodeProposalKey, pkgForCodeProposal);
        try {
            await proposalP;
            done = true;
        } catch{
            proposalP = undefined;
        }
        return done;
    };
}

function isOldestClient(container: Container) {
    if (container.connected) {
        const quorum = container.getQuorum();
        const thisClientSeq = container.clientId !== undefined ?
            quorum.getMember(container.clientId)?.sequenceNumber : undefined;

        if (thisClientSeq) {
            // see if this client has the lowest seq
            const clientWithLowerSeqExists =
                Array.from(quorum.getMembers().values())
                    .some((c) => thisClientSeq > c.sequenceNumber, thisClientSeq);

            // if this client is the oldest client, it should propose
            if (!clientWithLowerSeqExists) {
                return true;
            }
        }
    }
    return false;
}

export async function initializeContainerCode(
    container: Container,
    pkgForCodeProposal: IFluidCodeDetails): Promise<void> {

    const quorum = container.getQuorum();

    // nothing to do if the proposal exists
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    const proposeFunc = createProposeOnceFunc(quorum, pkgForCodeProposal);

    // start a promise waiting for context changed, which will happen once we get a code proposal
    const contextChangedP = new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));

    // short circuit if we know the container wasn't existing
    // this is the most common case
    if (!container.existing) {
        await Promise.all([
            proposeFunc(),
            contextChangedP,
        ]);
        return;
    }

    // wait for a code proposal to show up
    const proposalFoundP = new Promise<boolean>((resolve) => {
        // wait for quorum and resolve promise if code shows up:
        // it helps with faster rendering if we have no snapshot,
        // but it also allows Fluid Debugger to work with no snapshots
        const approveProposal = (_seqNumber, key: string) => {
            if (key === currentCodeProposalKey) {
                quorum.removeListener("approveProposal", approveProposal);
                resolve(true);
            }
        };
        quorum.on("approveProposal", approveProposal);
    });

    // wait for us to connect or a proposal to show up
    await Promise.race([
        proposalFoundP,
        new Promise<boolean>((resolve) => {
            if (!container.connected) {
                container.once("connected", () => resolve(false));
            } else {
                resolve(false);
            }
        }),
    ]);

    const proposeCodeIfOldestClient = async () => {
        // if no proposal found, and we are the older client, then propose, otherwise return false
        return Promise.race([
            proposalFoundP,
            isOldestClient(container) ? proposeFunc() : Promise.resolve(false),
        ]);
    };

    // we are connected and there still isn't a proposal
    // we'll wait for one to show up, and will create one
    // if we are the oldest client
    if (!await proposeCodeIfOldestClient())
    {
        const quorumChangeHandler = (resolve: (value: true) => void) => {
            proposeCodeIfOldestClient()
                .then((proposed) => {
                    if (proposed) {
                        resolve(proposed);
                    }
                }).catch(() => { });
        };

        await Promise.all([
            proposalFoundP,
            new Promise<boolean>((resolve) => quorum.on("addMember", () => quorumChangeHandler(resolve))),
            new Promise<boolean>((resolve) => quorum.on("removeMember", () => quorumChangeHandler(resolve))),
        ]);
        quorum.removeListener("addMember", quorumChangeHandler);
        quorum.removeListener("removeMember", quorumChangeHandler);
    }


    // finally wait for the context to change
    await contextChangedP;
}
