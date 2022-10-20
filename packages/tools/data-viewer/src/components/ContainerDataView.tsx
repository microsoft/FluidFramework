/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IFluidContainer } from "@fluidframework/fluid-static";

import { getInnerContainer } from "../Utilities";
import { DataObjectsView } from "./DataObjectsView";

// TODOs:
// - Container Read/Write permissions
// - UI to generate and save to disk snapshot of current state
// - UI to force disconnect / reconnect
// - Tooltips on data labels to indicate what they mean (mode, minimal sequence number, etc.)

/**
 * {@link ContainerDataView} input props.
 */
export interface ContainerDataViewProps {
    /**
     * ID of {@link ContainerDataViewProps.container | the container}.
     */
    containerId: string;

    /**
     * The Fluid container for which data will be displayed.
     */
    container: IFluidContainer;
}

/**
 * Displays information about the provided container.
 *
 * @param props - See {@link ContainerDataViewProps}.
 */
export function ContainerDataView(props: ContainerDataViewProps): React.ReactElement {
    const { containerId, container } = props;

    const innerContainer = getInnerContainer(container);

    // State bound to outer container
    const [isDirty, updateIsDirty] = useState<boolean>(container.isDirty);
    const [isDisposed, updateIsDisposed] = useState<boolean>(container.disposed);
    const [attachState, updateAttachState] = useState(container.attachState);
    const [connectionState, updateConnectionState] = useState(container.connectionState);

    // State bound to inner container
    const [resolvedUrl, updateResolvedUrl] = useState<IResolvedUrl | undefined>(
        innerContainer.resolvedUrl,
    );

    useEffect(() => {
        function onConnectionChange(): void {
            updateConnectionState(container.connectionState); // Should be connected
            updateAttachState(container.attachState);
            updateResolvedUrl(innerContainer.resolvedUrl);
        }

        function onDirty(): void {
            updateIsDirty(true);
        }

        function onSaved(): void {
            updateIsDirty(false);
        }

        function onDispose(): void {
            updateIsDisposed(true);
        }

        container.on("connected", onConnectionChange);
        container.on("disconnected", onConnectionChange);
        container.on("dirty", onDirty);
        container.on("saved", onSaved);
        container.on("disposed", onDispose);

        return (): void => {
            container.off("connected", onConnectionChange);
            container.off("disconnected", onConnectionChange);
            container.off("dirty", onDirty);
            container.off("saved", onSaved);
            container.off("disposed", onDispose);
        };
    }, [container, innerContainer]);

    let innerView: React.ReactElement;
    if (isDisposed) {
        innerView = (
            <div>
                <b>Disposed</b>
            </div>
        );
    } else {
        const initialObjects = container.initialObjects;

        const maybeResolvedUrlDiv =
            resolvedUrl === undefined ? (
                <></>
            ) : (
                <div>
                    <b>Resolved URL: </b>
                    {resolvedUrlToString(resolvedUrl)}
                </div>
            );

        innerView = (
            <Stack>
                <div>
                    <b>Connection state: </b>
                    {connectionStateToString(connectionState)}
                </div>
                <div>
                    <b>Attach state: </b>
                    {attachState}
                </div>
                {maybeResolvedUrlDiv}
                <div>
                    <b>Local edit state: </b>
                    {isDirty ? "Pending local edits" : "No pending local edits"}
                </div>
                <DataObjectsView initialObjects={initialObjects} />
            </Stack>
        );
    }

    // TODO: styling
    return (
        <Stack
            styles={{
                root: {
                    height: "100%",
                },
            }}
        >
            <div>
                <b>Container ID: </b>
                {containerId}
            </div>
            {innerView}
        </Stack>
    );
}

function connectionStateToString(connectionState: ConnectionState): string {
    switch (connectionState) {
        case ConnectionState.CatchingUp:
            return "Catching up";
        case ConnectionState.Connected:
            return "Connected";
        case ConnectionState.Disconnected:
            return "Disconnected";
        case ConnectionState.EstablishingConnection:
            return "Establishing connection";
        default:
            throw new TypeError(`Unrecognized ConnectionState value: "${connectionState}".`);
    }
}

function resolvedUrlToString(resolvedUrl: IResolvedUrl): string {
    switch (resolvedUrl.type) {
        case "fluid":
            return resolvedUrl.url;
        case "web":
            return resolvedUrl.data;
        default:
            throw new Error("Unrecognized IResolvedUrl type.");
    }
}
