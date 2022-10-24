/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Spinner, Stack } from "@fluentui/react";
import React from "react";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IFluidContainer } from "@fluidframework/fluid-static";

export interface ContainerStateViewProps {
    /**
     * The Fluid container for which data will be displayed.
     */
    container: IFluidContainer;
}

/**
 * Displays information about the container's internal state, including its disposal status,
 * connection state, attach state, etc.
 */
export function ContainerStateView(props: ContainerStateViewProps): React.ReactElement {
    const { container } = props;

    const [isDisposed, updateIsDisposed] = React.useState<boolean>(container.disposed);
    const [attachState, updateAttachState] = React.useState(container.attachState);
    const [connectionState, updateConnectionState] = React.useState(container.connectionState);

    React.useEffect(() => {
        function onConnectionChange(): void {
            updateConnectionState(container.connectionState); // Should be connected
            updateAttachState(container.attachState);
        }

        function onDispose(): void {
            updateIsDisposed(true);
        }

        container.on("connected", onConnectionChange);
        container.on("disconnected", onConnectionChange);
        container.on("disposed", onDispose);

        return (): void => {
            container.off("connected", onConnectionChange);
            container.off("disconnected", onConnectionChange);
            container.off("disposed", onDispose);
        };
    }, [container]);

    const children: React.ReactElement[] = [
        <span>
            <b>Status: </b>
        </span>,
    ];
    if (isDisposed) {
        children.push(<span>Disposed</span>);
    } else {
        children.push(<AttachStateView attachState={attachState} />);
        if (attachState === AttachState.Attached) {
            children.push(<ConnectionStateView connectionState={connectionState} />);
        }
    }

    return (
        <Stack horizontal>
            {children.map((child, index) => (
                <Stack.Item key={`state-child-${index}`} styles={{ root: { paddingRight: 5 } }}>
                    {child}
                </Stack.Item>
            ))}
        </Stack>
    );
}

/**
 * {@link AttachStateView} input props.
 */
interface AttachStateViewProps {
    attachState: AttachState;
}

/**
 * Simple view of {@link @fluidframework/container-definitions#AttachState} data.
 */
function AttachStateView(props: AttachStateViewProps): React.ReactElement {
    const { attachState } = props;

    // TODO: typography
    switch (attachState) {
        case AttachState.Attached:
            return <span>Attached</span>;
        case AttachState.Attaching:
            return (
                <Stack horizontal>
                    <Spinner /> Attaching...
                </Stack>
            );
        case AttachState.Detached:
            return <span>Detatched</span>;
        default:
            throw new Error(`Unrecognized AttachState value: "${attachState}".`);
    }
}

/**
 * {@link ConnectionStateView} input props.
 */
interface ConnectionStateViewProps {
    connectionState: ConnectionState;
}

/**
 * Simple view of {@link @fluidframework/container-loader#ConnectionState} data.
 */
function ConnectionStateView(props: ConnectionStateViewProps): React.ReactElement {
    const { connectionState } = props;

    // TODO: typography
    switch (connectionState) {
        case ConnectionState.CatchingUp:
            return (
                <Stack horizontal>
                    <Spinner /> Catching up...
                </Stack>
            );
        case ConnectionState.Connected:
            return <span>Connected</span>;
        case ConnectionState.Disconnected:
            return <span>Disconnected</span>;
        case ConnectionState.EstablishingConnection:
            return (
                <Stack horizontal>
                    <Spinner /> Establishing connection...
                </Stack>
            );
        default:
            throw new Error(`Unrecognized ConnectionState value: "${connectionState}".`);
    }
}
