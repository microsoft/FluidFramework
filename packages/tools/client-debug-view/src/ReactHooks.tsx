/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { IFluidClientDebugger } from "@fluid-tools/client-debugger";

/**
 * Contains React hooks for shared use within the library.
 */

/**
 * React hook for getting the session user's client ID.
 *
 * @internal
 */
export function useMyClientId(clientDebugger: IFluidClientDebugger): string | undefined {
    const [myClientId, setMyClientId] = React.useState<string | undefined>(
        clientDebugger.getMyClientId(),
    );

    React.useEffect(() => {
        function onContainerConnectionChange(): void {
            setMyClientId(clientDebugger.getMyClientId());
        }

        clientDebugger.on("containerConnected", onContainerConnectionChange);
        clientDebugger.on("containerDisconnected", onContainerConnectionChange);

        return (): void => {
            clientDebugger.off("containerConnected", onContainerConnectionChange);
            clientDebugger.off("containerDisconnected", onContainerConnectionChange);
        };
    }, [clientDebugger, setMyClientId]);

    return myClientId;
}

/**
 * React hook for getting the member data for the session user.
 *
 * @internal
 */
export function useMyAudienceData(clientDebugger: IFluidClientDebugger): IClient | undefined {
    const myClientId = useMyClientId(clientDebugger);

    const [audienceMembers, setAudienceMembers] = React.useState<Map<string, IClient>>(
        clientDebugger.getAudienceMembers(),
    );

    React.useEffect(() => {
        function onAudienceMembersChange(): void {
            setAudienceMembers(clientDebugger.getAudienceMembers());
        }

        clientDebugger.on("audienceMemberAdded", onAudienceMembersChange);
        clientDebugger.on("audienceMemberRemoved", onAudienceMembersChange);

        return (): void => {
            clientDebugger.off("audienceMemberAdded", onAudienceMembersChange);
            clientDebugger.off("audienceMemberRemoved", onAudienceMembersChange);
        };
    }, [clientDebugger, setAudienceMembers]);

    return myClientId === undefined ? undefined : audienceMembers.get(myClientId);
}

/**
 * React hook for getting the minimum sequence number of the delta service.
 *
 * @internal
 */
export function useMinimumSequenceNumber(clientDebugger: IFluidClientDebugger): number {
    const [minimumSequenceNumber, setMinimumSequenceNumber] = React.useState<number>(
        clientDebugger.getMinimumSequenceNumber(),
    );

    React.useEffect(() => {
        function onIncomingOpProcessed(): void {
            setMinimumSequenceNumber(clientDebugger.getMinimumSequenceNumber());
        }

        clientDebugger.on("incomingOpProcessed", onIncomingOpProcessed);

        return (): void => {
            clientDebugger.off("incomingOpProcessed", onIncomingOpProcessed);
        };
    }, [clientDebugger, setMinimumSequenceNumber]);

    return minimumSequenceNumber;
}
