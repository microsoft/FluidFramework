/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { HasClientDebugger } from "../CommonProps";
import { connectionStateToString } from "../Utilities";

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
	const { container } = clientDebugger;

	const [containerAttachState, setContainerAttachState] = React.useState<AttachState>(
		container.attachState,
	);
	const [containerConnectionState, setContainerConnectionState] = React.useState<ConnectionState>(
		container.connectionState,
	);
	const [isContainerDisposed, setIsContainerDisposed] = React.useState<boolean>(container.closed);

	React.useEffect(() => {
		function onContainerAttached(): void {
			setContainerAttachState(container.attachState);
		}

		function onContainerConnectionChange(): void {
			setContainerConnectionState(container.connectionState);
		}

		function onContainerDisposed(): void {
			setIsContainerDisposed(true);
		}

		container.on("attached", onContainerAttached);
		container.on("connected", onContainerConnectionChange);
		container.on("disconnected", onContainerConnectionChange);
		container.on("closed", onContainerDisposed);

		return (): void => {
			container.off("attached", onContainerAttached);
			container.off("connected", onContainerConnectionChange);
			container.off("disconnected", onContainerConnectionChange);
			container.off("closed", onContainerDisposed);
		};
	}, [container]);

	const children: React.ReactElement[] = [
		<span>
			<b>Status: </b>
		</span>,
	];
	if (isContainerDisposed) {
		children.push(<span>Disposed</span>);
	} else {
		children.push(<span>{containerAttachState}</span>);
		if (containerAttachState === AttachState.Attached) {
			children.push(<span>{connectionStateToString(containerConnectionState)}</span>);
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
