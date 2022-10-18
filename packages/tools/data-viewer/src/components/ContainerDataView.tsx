/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { AttachState, IContainer } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IFluidContainer } from "@fluidframework/fluid-static";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { DataObjectsView } from "./DataObjectsView";

// TODOs:
// - UI to generate and save to disk snapshot of current state
// - UI to force disconnect / reconnect

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

    // Hack to get at container internals
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const innerContainer = (container as any).container as IContainer;
    if (innerContainer === undefined) {
        throw new Error("Could not find inner IContainer under IFluidContainer.");
    }

    const { deltaManager } = innerContainer;

    // State bound to outer container
    const [isDirty, updateIsDirty] = useState<boolean>(container.isDirty);
    const [isDisposed, updateIsDisposed] = useState<boolean>(container.disposed);
    const [attachState, updateAttachState] = useState(container.attachState);
    const [connectionState, updateConnectionState] = useState(container.connectionState);

    // State bound to inner container
    const [resolvedUrl, updateResolvedUrl] = useState<IResolvedUrl | undefined>(
        innerContainer.resolvedUrl,
    );

    // State bound to delta manager
    const [minimumSequenceNumber, updateMinimumSequenceNumber] = useState<number>(
        deltaManager.minimumSequenceNumber,
    );

    // TODO: readonly toggle control
    const readOnlyDataViews =
        // If we have not yet attached to the container, do not allow editing of underlying data.
        attachState !== AttachState.Attached ||
        // If we do not have an active connection, do not allow editing of underlying data.
        [ConnectionState.Disconnected, ConnectionState.EstablishingConnection].includes(
            connectionState,
        ) ||
        // If the container has been disposed, we can't make edits anyways.
        isDisposed;

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

        function onOp(message: ISequencedDocumentMessage): void {
            updateMinimumSequenceNumber(message.minimumSequenceNumber);
        }

        container.on("connected", onConnectionChange);
        container.on("disconnected", onConnectionChange);
        container.on("dirty", onDirty);
        container.on("saved", onSaved);
        container.on("disposed", onDispose);

        innerContainer.on("op", onOp);

        return (): void => {
            container.off("connected", onConnectionChange);
            container.off("disconnected", onConnectionChange);
            container.off("dirty", onDirty);
            container.off("saved", onSaved);
            container.off("disposed", onDispose);

            innerContainer.off("op", onOp);
        };
    }, [container]);

    let innerView: React.ReactElement;
    if (isDisposed) {
        innerView = (
            <div>
                <b>Disposed</b>
            </div>
        );
    } else {
        // TODO: confirm that this never gets updated during a container session.
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
                    <b>Mode: </b>
                    {readOnlyDataViews ? "Readonly" : "Read/Write"}
                </div>
                <div>
                    <b>Local edit state: </b>
                    {isDirty ? "Pending local edits" : "No pending local edits"}
                </div>
                <div>
                    <b>Minimum sequence number: </b>
                    {minimumSequenceNumber}
                </div>
                <DataObjectsView initialObjects={initialObjects} />
            </Stack>
        );
    }

    // TODO: styling
    return (
        <div className="container-data-view">
            <h2>Container</h2>
            <Stack>
                <div>
                    <b>Container ID: </b>
                    {containerId}
                </div>
                {innerView}
            </Stack>
        </div>
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
