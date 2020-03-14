/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";

const currentCodeProposalKey = "code";

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
    pkgForCodeProposal: IFluidCodeDetails,
): Promise<void> {
    const quorum = container.getQuorum();

    // Nothing to do if the proposal exists
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // Since we don't have a proposal, establish the promise that will resolve once the container is ready
    const contextChangedP = new Promise<void>((resolve) => container.once("contextChanged", () => resolve()));

    if (!container.connected) {
        // Wait for us to connect (so we can figure out if we are the oldest)
        // Or a proposal to show up (which could happen during the connecting phase)
        await Promise.race([
            contextChangedP,
            new Promise<void>((resolve) => container.once("connected", () => resolve())),
        ]);
    }

    // If the proposal was found during connecting, we're done
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // Otherwise start watching to see when we become the oldest client
    const becameOldestP = new Promise<void>((resolve) => {
        if (isOldestClient(container)) {
            resolve();
        } else {
            const quorumChangeHandler = () => {
                if (isOldestClient(container)) {
                    resolve();
                    quorum.off("removeMember", quorumChangeHandler);
                }
            };
            quorum.on("removeMember", quorumChangeHandler);
        }
    });

    // Wait for the oldest client to make the proposal, or for us to become the oldest
    await Promise.race([
        contextChangedP,
        becameOldestP,
    ]);

    // If the proposal was made by someone else, we're done
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // Otherwise we're the oldest and we should make the proposal
    await quorum.propose(currentCodeProposalKey, pkgForCodeProposal);
}
