/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Spinner, Stack, StackItem } from "@fluentui/react";
import React from "react";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { HasClientDebugger } from "../CommonProps";

/**
 * {@link ContainerStateView} input props.
 */
export type ContainerStateViewProps = HasClientDebugger;

/**
 * Displays information about the container's internal state, including its disposal status,
 * connection state, attach state, etc.
 */
export function ContainerStateView(props: ContainerStateViewProps): React.ReactElement {
    const { clientDebugger } = props;

    const [isDisposed, updateIsDisposed] = React.useState<boolean>(clientDebugger.disposed);
    const [attachState, updateAttachState] = React.useState(clientDebugger.getAttachState());
    const [connectionState, updateConnectionState] = React.useState(
        clientDebugger.getConnectionState(),
    );

    React.useEffect(() => {
        function onConnectionChange(): void {
            updateConnectionState(clientDebugger.getConnectionState);
            updateAttachState(clientDebugger.getAttachState);
        }

        function onDispose(): void {
            updateIsDisposed(true);
        }

        clientDebugger.on("containerConnected", onConnectionChange);
        clientDebugger.on("containerDisconnected", onConnectionChange);
        clientDebugger.on("containerClosed", onDispose);

        return (): void => {
            clientDebugger.off("containerConnected", onConnectionChange);
            clientDebugger.off("containerDisconnected", onConnectionChange);
            clientDebugger.off("containerClosed", onDispose);
        };
    }, [clientDebugger]);

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
                <StackItem key={`state-child-${index}`} styles={{ root: { paddingRight: 5 } }}>
                    {child}
                </StackItem>
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
