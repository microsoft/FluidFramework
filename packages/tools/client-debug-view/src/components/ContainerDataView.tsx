/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackItemStyles, IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React, { useEffect, useState } from "react";

import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import { IFluidContainer } from "@fluidframework/fluid-static";

import { getInnerContainer } from "../Utilities";

// TODOs:
// - Container Read/Write permissions
// - UI to generate and save to disk snapshot of current state
// - Tooltips on data labels to indicate what they mean (mode, minimal sequence number, etc.)
// - History of container state changes

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
        const maybeResolvedUrlView =
            resolvedUrl === undefined ? (
                <></>
            ) : (
                <StackItem>
                    <b>Resolved URL: </b>
                    {resolvedUrlToString(resolvedUrl)}
                </StackItem>
            );

        innerView = (
            <Stack>
                <StackItem>
                    <b>Attach state: </b>
                    {attachState}
                </StackItem>
                <StackItem>
                    <b>Connection state: </b>
                    {connectionStateToString(connectionState)}
                </StackItem>
                {maybeResolvedUrlView}
                <StackItem>
                    <b>Local edit state: </b>
                    {isDirty ? "Pending local edits" : "No pending local edits"}
                </StackItem>
                <StackItem align="end">
                    <ActionsBar
                        connectionState={connectionState}
                        tryConnect={(): void => container.connect()}
                        forceDisconnect={(): void => container.disconnect()}
                        disposeContainer={(): void => container.dispose()}
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
    disposeContainer(): void;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
    const { connectionState, tryConnect, forceDisconnect, disposeContainer } = props;

    const connectButtonTooltipId = useId("connect-button-tooltip");
    const disconnectButtonTooltipId = useId("disconnect-button-tooltip");
    const disposeContainerButtonTooltipId = useId("dispose-container-button-tooltip");

    const changeConnectionStateButton =
        connectionState === ConnectionState.Disconnected ? (
            <TooltipHost content="Connect" id={connectButtonTooltipId}>
                <IconButton
                    onClick={tryConnect}
                    menuIconProps={{ iconName: "PlugConnected" }}
                    aria-describedby={connectButtonTooltipId}
                />
            </TooltipHost>
        ) : (
            <TooltipHost content="Disconnect" id={disconnectButtonTooltipId}>
                <IconButton
                    onClick={forceDisconnect}
                    menuIconProps={{ iconName: "PlugDisconnected" }}
                    aria-describedby={disconnectButtonTooltipId}
                />
            </TooltipHost>
        );

    const disposeContainerButton = (
        <TooltipHost content="Dispose container" id={disposeContainerButtonTooltipId}>
            <IconButton
                onClick={disposeContainer}
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
