/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

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

	const [isContainerAttached, setIsContainerAttached] = React.useState<boolean>(
		clientDebugger.isContainerAttached(),
	);
	const [isContainerConnected, setIsContainerConnected] = React.useState<boolean>(
		clientDebugger.isContainerConnected(),
	);
	const [isContainerDisposed, setIsContainerDisposed] = React.useState<boolean>(
		clientDebugger.disposed,
	);

	React.useEffect(() => {
		function onContainerAttached(): void {
			setIsContainerAttached(true);
		}

		function onContainerConnectionChange(): void {
			setIsContainerConnected(clientDebugger.isContainerConnected());
		}

		function onContainerDisposed(): void {
			setIsContainerDisposed(true);
		}

		clientDebugger.on("containerAttached", onContainerAttached);
		clientDebugger.on("containerConnected", onContainerConnectionChange);
		clientDebugger.on("containerDisconnected", onContainerConnectionChange);
		clientDebugger.on("containerClosed", onContainerDisposed);

		return (): void => {
			clientDebugger.off("containerAttached", onContainerAttached);
			clientDebugger.off("containerConnected", onContainerConnectionChange);
			clientDebugger.off("containerDisconnected", onContainerConnectionChange);
			clientDebugger.off("containerClosed", onContainerDisposed);
		};
	}, [clientDebugger]);

	const children: React.ReactElement[] = [
		<span>
			<b>Status: </b>
		</span>,
	];
	if (isContainerDisposed) {
		children.push(<span>Disposed</span>);
	} else {
		children.push(<span>{isContainerAttached ? "Attached" : "Detached"}</span>);

		if (isContainerAttached) {
			children.push(<span>{isContainerConnected ? "Connected" : "Disconnected"}</span>);
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
