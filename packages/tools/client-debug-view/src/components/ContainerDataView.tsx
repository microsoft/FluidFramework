/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackItemStyles, IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

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
    const [isContainerDirty, setIsContainerDirty] = React.useState<boolean>(
        clientDebugger.isContainerDirty(),
    );
    const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(
        clientDebugger.isContainerClosed(),
    );
    const [isContainerAttached, setIsContainerAttached] = React.useState<boolean>(
        clientDebugger.isContainerAttached(),
    );
    const [isContainerConnected, setIsContainerConnected] = React.useState<boolean>(
        clientDebugger.isContainerConnected(),
    );
    const [containerResolvedUrl, setContainerResolvedUrl] = React.useState<
        IResolvedUrl | undefined
    >(clientDebugger.getContainerResolvedUrl());

    React.useEffect(() => {
        function onContainerAttached(): void {
            setIsContainerAttached(true);
            setContainerResolvedUrl(clientDebugger.getContainerResolvedUrl());
        }

        function onConnectionChange(): void {
            setIsContainerConnected(clientDebugger.isContainerConnected());
            setIsContainerDirty(clientDebugger.isContainerDirty());
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

        clientDebugger.on("containerAttached", onContainerAttached);
        clientDebugger.on("containerConnected", onConnectionChange);
        clientDebugger.on("containerDisconnected", onConnectionChange);
        clientDebugger.on("containerDirty", onContainerDirty);
        clientDebugger.on("containerSaved", onContainerSaved);
        clientDebugger.on("containerClosed", onContainerClosed);

        return (): void => {
            clientDebugger.off("containerAttached", onContainerAttached);
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
        setIsContainerAttached,
        setIsContainerConnected,
        setContainerResolvedUrl,
    ]);

    let innerView: React.ReactElement;

    // eslint-disable-next-line unicorn/prefer-ternary
    if (isContainerClosed) {
        innerView = (
            <div>
                <b>Disposed</b>
            </div>
        );
    } else {
        innerView = (
            <Stack>
                <StackItem>
                    <b>Attach state: </b>
                    {isContainerAttached ? "Attached" : "Detached"}
                </StackItem>
                {containerResolvedUrl === undefined ? (
                    <></>
                ) : (
                    <StackItem>
                        <b>Resolved URL: </b>
                        {resolvedUrlToString(containerResolvedUrl)}
                    </StackItem>
                )}
                <StackItem>
                    <b>Connection state: </b>
                    {isContainerConnected ? "Connected" : "Disconnected"}
                </StackItem>
                <StackItem>
                    <b>Local edit state: </b>
                    {isContainerDirty ? "Dirty" : "Saved"}
                </StackItem>
                <StackItem align="end">
                    <ActionsBar
                        isContainerConnected={isContainerConnected}
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
    isContainerConnected: boolean;
    tryConnect(): void;
    forceDisconnect(): void;
    closeContainer(): void;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
    const { isContainerConnected, tryConnect, forceDisconnect, closeContainer } = props;

    const connectButtonTooltipId = useId("connect-button-tooltip");
    const disconnectButtonTooltipId = useId("disconnect-button-tooltip");
    const disposeContainerButtonTooltipId = useId("dispose-container-button-tooltip");

    const changeConnectionStateButton = isContainerConnected ? (
        <TooltipHost content="Disconnect Container" id={disconnectButtonTooltipId}>
            <IconButton
                onClick={forceDisconnect}
                menuIconProps={{ iconName: "PlugDisconnected" }}
                aria-describedby={disconnectButtonTooltipId}
            />
        </TooltipHost>
    ) : (
        <TooltipHost content="Connect Container" id={connectButtonTooltipId}>
            <IconButton
                onClick={tryConnect}
                menuIconProps={{ iconName: "PlugConnected" }}
                aria-describedby={connectButtonTooltipId}
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
