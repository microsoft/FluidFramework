/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React from "react";

import { HasClientDebugger } from "../CommonProps";
import { useMyAudienceData } from "../ReactHooks";
import { ContainerStateView } from "./ContainerStateView";

/**
 * {@link ContainerSummaryView} input props.
 */
export type ContainerSummaryViewProps = HasClientDebugger;

/**
 * Small header that displays core container data.
 *
 * @param props - See {@link ContainerSummaryViewProps}.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
    const { clientDebugger } = props;

    const { containerId } = clientDebugger;

    const myAudienceData = useMyAudienceData(clientDebugger);

    React.useEffect(() => {
        function onAudienceMemberAdded(): void {
            setMyClientId(clientDebugger.getMyClientId());
        }

        clientDebugger.on("audienceMemberAdded", onAudienceMemberAdded);
        clientDebugger.on("audienceMemberRemoved", onAudienceMemberAdded);
    }, [clientDebugger]);

    const maybeClientIdView =
        myClientId === undefined ? (
            <></>
        ) : (
            <div>
                <b>Client ID: </b>
                {myClientId}
            </div>
        );

    const maybeAudienceIdView =
        myself === undefined ? (
            <></>
        ) : (
            <div>
                <b>My audience ID: </b>
                {myself.userId}
            </div>
        );

    return (
        <Stack className="container-summary-view">
            <div>
                <b>Container ID: </b>
                {containerId}
            </div>
            {maybeClientIdView}
            {maybeAudienceIdView}
            <ContainerStateView clientDebugger={clientDebugger} />
        </Stack>
    );
}
