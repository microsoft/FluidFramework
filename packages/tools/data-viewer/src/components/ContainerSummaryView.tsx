/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React from "react";

import { IFluidContainer, IMember } from "@fluidframework/fluid-static";

import { ContainerStateView } from "./ContainerStateView";

/**
 * {@link ContainerSummaryView} input props.
 */
export interface ContainerSummaryViewProps {
    /**
     * ID of {@link ContainerSummaryViewProps.container | the container}.
     */
    containerId: string;

    /**
     * The client ID for the session.
     */
    clientId: string | undefined;

    /**
     * The Fluid container for which data will be displayed.
     */
    container: IFluidContainer;

    /**
     * Audience member infor for the session user.
     */
    myself: IMember | undefined;
}

/**
 * Small header that displays core container data.
 *
 * @param props - See {@link ContainerSummaryViewProps}.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
    const { containerId, clientId, container, myself } = props;

    const maybeClientIdView =
        clientId === undefined ? (
            <></>
        ) : (
            <div>
                <b>Client ID: </b>
                {clientId}
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
            <ContainerStateView container={container} />
        </Stack>
    );
}
