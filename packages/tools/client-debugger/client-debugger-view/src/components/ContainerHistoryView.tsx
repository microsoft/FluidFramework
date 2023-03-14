/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, IStackItemStyles, Icon, Stack, StackItem } from "@fluentui/react";
import React from "react";

import {
	ConnectionStateChangeLogEntry,
	ContainerStateChangeKind,
} from "@fluid-tools/client-debugger";

import { HasClientDebugger } from "../CommonProps";

/**
 * {@link ContainerHistory} input props.
 */
export type ContainerHistoryProps = HasClientDebugger;

/**
 * Displays information about the provided {@link IFluidClientDebugger.getContainerConnectionLog}.
 *
 * @param props - See {@link ContainerHistoryViewProps}.
 */
export function ContainerHistoryView(props: ContainerHistoryProps): React.ReactElement {
	const { clientDebugger } = props;
	const { container } = clientDebugger;

	const [containerHistory, setContainerHistory] = React.useState<
		readonly ConnectionStateChangeLogEntry[]
	>(clientDebugger.getContainerConnectionLog());

	React.useEffect(() => {
		function onContainerHistoryChanged(): void {
			setContainerHistory(clientDebugger.getContainerConnectionLog());
		}

		container.on("attached", onContainerHistoryChanged);
		container.on("connected", onContainerHistoryChanged);
		container.on("disconnected", onContainerHistoryChanged);
		container.on("disposed", onContainerHistoryChanged);
		container.on("closed", onContainerHistoryChanged);

		return (): void => {
			container.off("attached", onContainerHistoryChanged);
			container.off("connected", onContainerHistoryChanged);
			container.off("disconnected", onContainerHistoryChanged);
			container.off("disposed", onContainerHistoryChanged);
			container.off("closed", onContainerHistoryChanged);
		};
	}, [clientDebugger, container, setContainerHistory]);

	return (
		<Stack
			styles={{
				root: {
					height: "100%",
				},
			}}
		>
			<StackItem>
				<h3>Container State History</h3>
				<_ContainerHistoryView containerHistory={containerHistory} />
			</StackItem>
		</Stack>
	);
}

/**
 * Input props for {@link _ContainerHistoryView}
 */
export interface _ContainerHistoryViewProps {
	/**
	 * The connection state history of the container.
	 */
	containerHistory: readonly ConnectionStateChangeLogEntry[];
}

/**
 * Displays a container's history of connection state changes.
 */
export function _ContainerHistoryView(props: _ContainerHistoryViewProps): React.ReactElement {
	const { containerHistory } = props;
	const nowTimeStamp = new Date();
	const historyViews: React.ReactElement[] = [];

	// Newest events are displayed first
	for (let i = containerHistory.length - 1; i >= 0; i--) {
		const changeTimeStamp = new Date(containerHistory[i].timestamp);
		const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

		const accordionBackgroundColor: IStackItemStyles = {
			root: {
				background:
					containerHistory[i].newState === ContainerStateChangeKind.Connected
						? "#F0FFF0" // green
						: containerHistory[i].newState === ContainerStateChangeKind.Attached
						? "#F0FFFF" // blue
						: containerHistory[i].newState === ContainerStateChangeKind.Disconnected
						? "#FDF5E6" // yellow
						: containerHistory[i].newState === ContainerStateChangeKind.Closed
						? "#FFF0F5" // red
						: containerHistory[i].newState === ContainerStateChangeKind.Disposed
						? "#FFE4E1" // dark red
						: "#C0C0C0", // grey for unknown state
				borderStyle: "solid",
				borderWidth: 1,
				borderColor: DefaultPalette.neutralTertiary,
				padding: 3,
			},
		};

		const iconStyle: IStackItemStyles = {
			root: {
				padding: 10,
			},
		};

		historyViews.push(
			<div key={`container-history-info-${i}`}>
				<Stack horizontal={true} styles={accordionBackgroundColor}>
					<StackItem styles={iconStyle}>
						<Icon
							iconName={
								containerHistory[i].newState === ContainerStateChangeKind.Connected
									? "PlugConnected"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Attached
									? "Attach"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Disconnected
									? "PlugDisconnected"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Disposed
									? "RemoveLink"
									: containerHistory[i].newState ===
									  ContainerStateChangeKind.Closed
									? "SkypeCircleMinus"
									: "Help"
							}
						/>
					</StackItem>
					<StackItem>
						<div
							key={`${containerHistory[i].newState}-${containerHistory[i].timestamp}`}
						>
							<b>State: </b>
							{containerHistory[i].newState}
							<br />
							<b>Time: </b>
							{wasChangeToday
								? changeTimeStamp.toTimeString()
								: changeTimeStamp.toDateString()}
							<br />
						</div>
					</StackItem>
				</Stack>
			</div>,
		);
	}

	return (
		<Stack
			styles={{
				root: {
					overflowY: "auto",
					height: "300px",
				},
			}}
		>
			<div style={{ overflowY: "scroll" }}>{historyViews}</div>
		</Stack>
	);
}
