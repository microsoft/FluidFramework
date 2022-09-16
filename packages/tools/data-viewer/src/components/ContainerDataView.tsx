/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { useEffect, useState } from "react";

import { AttachState, ConnectionState, IFluidContainer } from "fluid-framework";

import { DataObjectView } from "./DataObjectView";

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

    const [isDirty, updateIsDirty] = useState<boolean>(container.isDirty);
    const [isDisposed, updateIsDisposed] = useState<boolean>(container.disposed);
    const [attachState, updateAttachState] = useState(container.attachState);
    const [connectionState, updateConnectionState] = useState(container.connectionState);

    // TODO: readonly toggle control

    let readOnlyDataViews =
        // If we have not yet attached to the container, do not allow editing of underlying data.
        attachState !== AttachState.Attached ||
        // If we do not have an active connection, do not allow editing of underlying data.
        [ConnectionState.Disconnected, ConnectionState.EstablishingConnection].includes(
            connectionState,
        ) ||
        // If the container has been disposed, we can't make edits anyways.
        isDisposed;

    useEffect(() => {
        function onConnected() {
            updateConnectionState(container.connectionState);
            updateAttachState(container.attachState);
        }
        function onDirty() {
            updateIsDirty(true);
        }

        function onSaved() {
            updateIsDirty(false);
        }

        function onDispose() {
            updateIsDisposed(true);
        }

        container.on("connected", onConnected);
        container.on("dirty", onDirty);
        container.on("saved", onSaved);
        container.on("dispose", onDispose);

        return () => {
            container.off("connected", onConnected);
            container.off("dirty", onDirty);
            container.off("saved", onSaved);
            container.off("dispose", onDispose);
        };
    }, [container]);

    let innerContents: React.ReactElement;
    if (isDisposed) {
        innerContents = (
            <div>
                <b>Disposed</b>
            </div>
        );
    } else {
        const initialObjects = container.initialObjects;
        const objectViews = Object.entries(initialObjects).map(([key, value]) => {
            return (
                <React.Fragment key={key}>
                    <DataObjectView name={key} dataObject={value} />
                </React.Fragment>
            );
        });

        // TODO: styling
        innerContents = (
            <div>
                <div>
                    <b>Connection state: </b>
                    {connectionStateToString(connectionState)}
                </div>
                <div>
                    <b>Attach state: </b>
                    {attachState}
                </div>
                <div>{isDirty ? "Pending local edits" : "No pending local edits"}</div>
                <hr />
                <div>{objectViews}</div>
            </div>
        );
    }

    // TODO: styling
    return (
        <div>
            <div>
                <b>Container ID: </b>
                {containerId}
            </div>
            {innerContents}
            {readOnlyDataViews ? "readonly :)" : "not readonly :O"}
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
