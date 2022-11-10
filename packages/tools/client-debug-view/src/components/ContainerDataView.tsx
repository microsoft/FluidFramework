/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackItemStyles, IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React, { useEffect, useState } from "react";

import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

import { HasClientDebugger } from "../CommonProps";

// TODOs:
// - Container Read/Write permissions
// - UI to generate and save to disk snapshot of current state
// - Tooltips on data labels to indicate what they mean (mode, minimal sequence number, etc.)
// - History of container state changes

/**
 * {@link ContainerDataView} input props.
 */
export type ContainerDataViewProps = HasClientDebugger;

/**
 * Displays information about the provided container.
 *
 * @param props - See {@link ContainerDataViewProps}.
 */
export function ContainerDataView(props: ContainerDataViewProps): React.ReactElement {
    const { clientDebugger } = props;
    const { containerId } = clientDebugger;

    // State bound to outer container
    const [isContainerDirty, setIsContainerDirty] = useState<boolean>(
        clientDebugger.isContainerDirty(),
    );
    const [isContainerClosed, setIsContainerClosed] = useState<boolean>(
        clientDebugger.isContainerClosed(),
    );
    const [containerAttachState, setContainerAttachState] = useState(
        clientDebugger.getContainerAttachState(),
    );
    const [containerConnectionState, setContainerConnectionState] = useState(
        clientDebugger.getContainerConnectionState(),
    );
    const [containerResolvedUrl, setContainerResolvedUrl] = useState<IResolvedUrl | undefined>(
        clientDebugger.getContainerResolvedUrl(),
    );

    useEffect(() => {
        function onConnectionChange(): void {
            setContainerConnectionState(clientDebugger.getContainerConnectionState());
            setIsContainerDirty(clientDebugger.isContainerDirty());

            // TODO: When do these change? Do we need these here?
            setContainerAttachState(clientDebugger.getContainerAttachState());
            setContainerResolvedUrl(clientDebugger.getContainerResolvedUrl());
        }

        function onContainerDirty(): void {
            setIsContainerDirty(true);
        }

        function onContainerSaved(): void {
            setIsContainerDirty(false);
        }

        function onContainerClosed(): void {
            setIsContainerClosed(true);
        }

        clientDebugger.on("containerConnected", onConnectionChange);
        clientDebugger.on("containerDisconnected", onConnectionChange);
        clientDebugger.on("containerDirty", onContainerDirty);
        clientDebugger.on("containerSaved", onContainerSaved);
        clientDebugger.on("containerClosed", onContainerClosed);

        return (): void => {
            clientDebugger.off("containerConnected", onConnectionChange);
            clientDebugger.off("containerDisconnected", onConnectionChange);
            clientDebugger.off("containerDirty", onContainerDirty);
            clientDebugger.off("containerSaved", onContainerSaved);
            clientDebugger.off("containerClosed", onContainerClosed);
        };
    }, [
        clientDebugger,
        setIsContainerDirty,
        setIsContainerClosed,
        setContainerAttachState,
        setContainerConnectionState,
        setContainerResolvedUrl,
    ]);

    let innerView: React.ReactElement;
    if (isContainerClosed) {
        innerView = (
            <div>
                <b>Disposed</b>
            </div>
        );
    } else {
        const maybeResolvedUrlView =
            containerResolvedUrl === undefined ? (
                <></>
            ) : (
                <StackItem>
                    <b>Resolved URL: </b>
                    {resolvedUrlToString(containerResolvedUrl)}
                </StackItem>
            );

        innerView = (
            <Stack>
                <StackItem>
                    <b>Attach state: </b>
                    {containerAttachState}
                </StackItem>
                <StackItem>
                    <b>Connection state: </b>
                    {connectionStateToString(containerConnectionState)}
                </StackItem>
                {maybeResolvedUrlView}
                <StackItem>
                    <b>Local edit state: </b>
                    {isContainerDirty ? "Pending local edits" : "No pending local edits"}
                </StackItem>
                <StackItem align="end">
                    <ActionsBar
                        connectionState={containerConnectionState}
                        tryConnect={(): void => clientDebugger.tryConnectContainer()}
                        forceDisconnect={(): void => clientDebugger.disconnectContainer()}
                        closeContainer={(): void => clientDebugger.closeContainer()}
                    />
                </StackItem>
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

interface ActionsBarProps {
    connectionState: ConnectionState;
    tryConnect(): void;
    forceDisconnect(): void;
    closeContainer(): void;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
    const { connectionState, tryConnect, forceDisconnect, closeContainer } = props;

    const connectButtonTooltipId = useId("connect-button-tooltip");
    const disconnectButtonTooltipId = useId("disconnect-button-tooltip");
    const disposeContainerButtonTooltipId = useId("dispose-container-button-tooltip");

    const changeConnectionStateButton =
        connectionState === ConnectionState.Disconnected ? (
            <TooltipHost content="Connect Container" id={connectButtonTooltipId}>
                <IconButton
                    onClick={tryConnect}
                    menuIconProps={{ iconName: "PlugConnected" }}
                    aria-describedby={connectButtonTooltipId}
                />
            </TooltipHost>
        ) : (
            <TooltipHost content="Disconnect Container" id={disconnectButtonTooltipId}>
                <IconButton
                    onClick={forceDisconnect}
                    menuIconProps={{ iconName: "PlugDisconnected" }}
                    aria-describedby={disconnectButtonTooltipId}
                />
            </TooltipHost>
        );

    const disposeContainerButton = (
        <TooltipHost content="Close Container" id={disposeContainerButtonTooltipId}>
            <IconButton
                onClick={closeContainer}
                menuIconProps={{ iconName: "Delete" }}
                aria-describedby={disposeContainerButtonTooltipId}
            />
        </TooltipHost>
    );

    const itemStyles: IStackItemStyles = {
        root: {
            padding: "5px",
        },
    };

    return (
        <Stack horizontal>
            <StackItem styles={itemStyles}>{changeConnectionStateButton}</StackItem>
            <StackItem styles={itemStyles}>{disposeContainerButton}</StackItem>
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
