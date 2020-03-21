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

/**
 * Ensures that the given container has an approved code proposal, and proposes the code package passed if needed.
 * Note that although this guarantees an approved code proposal before returning, the context may not have been
 * reloaded yet.
 * @param container - The container to be initialized with the code
 * @param pkgForCodeProposal - The code to propose if a proposal has not already been made
 */
export async function initializeContainerCode(
    container: Container,
    pkgForCodeProposal: IFluidCodeDetails,
): Promise<void> {
    const quorum = container.getQuorum();

    // Nothing to do if the code has been proposed
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // Since we don't have a proposal, establish the promise that will resolve once the proposal is approved
    const codeApprovedP = new Promise<void>((resolve) => {
        if (quorum.has(currentCodeProposalKey)) {
            resolve();
        } else {
            const approveProposalHandler = (sequenceNumber: number, key: string) => {
                if (key === currentCodeProposalKey) {
                    quorum.off("approveProposal", approveProposalHandler);
                    resolve();
                }
            };
            quorum.on("approveProposal", approveProposalHandler);
        }
    });

    if (!container.connected) {
        // Wait for us to connect (so we can figure out if we are the oldest)
        // Or an approved proposal to show up (which could happen during the connecting phase)
        await Promise.race([
            codeApprovedP,
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
        codeApprovedP,
        becameOldestP,
    ]);

    // If the proposal was made by someone else, we're done
    if (quorum.has(currentCodeProposalKey)) {
        return;
    }

    // Otherwise we're the oldest and we should make the proposal
    await quorum.propose(currentCodeProposalKey, pkgForCodeProposal);
}
