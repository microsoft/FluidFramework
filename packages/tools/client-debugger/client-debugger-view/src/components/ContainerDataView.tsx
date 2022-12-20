/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackItemStyles, IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IResolvedUrl } from "@fluidframework/driver-definitions";

import { HasClientDebugger } from "../CommonProps";
import { connectionStateToString } from "../Utilities";

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
	const { containerId, container } = clientDebugger;

	// State bound to outer container
	const [isContainerDirty, setIsContainerDirty] = React.useState<boolean>(container.isDirty);
	const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(container.closed);
	const [containerAttachState, setContainerAttachState] = React.useState<AttachState>(
		container.attachState,
	);
	const [containerConnectionState, setContainerConnectionState] = React.useState<ConnectionState>(
		container.connectionState,
	);
	const [containerResolvedUrl, setContainerResolvedUrl] = React.useState<
		IResolvedUrl | undefined
	>(container.resolvedUrl);

	React.useEffect(() => {
		function onContainerAttached(): void {
			setContainerAttachState(container.attachState);
			setContainerResolvedUrl(container.resolvedUrl);
		}

		function onConnectionChange(): void {
			setContainerConnectionState(container.connectionState);
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

		container.on("attached", onContainerAttached);
		container.on("connected", onConnectionChange);
		container.on("disconnected", onConnectionChange);
		container.on("dirty", onContainerDirty);
		container.on("saved", onContainerSaved);
		container.on("closed", onContainerClosed);

		return (): void => {
			container.off("attached", onContainerAttached);
			container.off("connected", onConnectionChange);
			container.off("disconnected", onConnectionChange);
			container.off("dirty", onContainerDirty);
			container.off("saved", onContainerSaved);
			container.off("closed", onContainerClosed);
		};
	}, [
		container,
		setIsContainerDirty,
		setIsContainerClosed,
		setContainerAttachState,
		setContainerConnectionState,
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
					{containerAttachState}
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
					{connectionStateToString(containerConnectionState)}
				</StackItem>
				<StackItem>
					<b>Local edit state: </b>
					{isContainerDirty ? "Dirty" : "Saved"}
				</StackItem>
				<StackItem align="end">
					<ActionsBar
						isContainerConnected={
							containerConnectionState === ConnectionState.Connected
						}
						tryConnect={(): void => container.connect()}
						forceDisconnect={(): void => container.disconnect()}
						closeContainer={(): void => container.close()}
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
