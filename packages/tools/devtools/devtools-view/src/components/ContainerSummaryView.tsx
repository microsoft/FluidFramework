/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStackItemStyles, Stack, StackItem } from "@fluentui/react";
import {
	Button,
	Badge,
	createTableColumn,
	Table,
	TableRow,
	TableCell,
	TableCellLayout,
	TableColumnDefinition,
	TableColumnSizingOptions,
	useTableFeatures,
	useTableColumnSizing_unstable,
} from "@fluentui/react-components";
import { InfoLabel } from "@fluentui/react-components/unstable";
import {
	PlugConnected20Regular,
	PlugDisconnected20Regular,
	Delete20Regular,
} from "@fluentui/react-icons";
import React from "react";

import {
	CloseContainer,
	ConnectContainer,
	ContainerStateChange,
	ContainerStateMetadata,
	DisconnectContainer,
	GetContainerState,
	handleIncomingMessage,
	HasContainerKey,
	IMessageRelay,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-experimental/devtools-core";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";

import { initializeFluentUiIcons } from "../InitializeIcons";
import { connectionStateToString } from "../Utilities";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";
import { clientIdTooltipText, containerStatusTooltipText, userIdTooltipText } from "./TooltipTexts";

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

/**
 * {@link ContainerSummaryView} input props.
 */
export type ContainerSummaryViewProps = HasContainerKey;

const columnsDef: TableColumnDefinition<Item>[] = [
	createTableColumn<Item>({
		columnId: "containerProperty",
	}),
	createTableColumn<Item>({
		columnId: "value",
	}),
];

/**
 * Simple representation of each row of data in the table
 */
interface Item {
	/*
	 * The type of container property, ie: Container/Audience ID etc
	 */
	property: string;
	/*
	 * The value of the property.
	 */
	value: string;
}

/**
 * {@link DataRow} input props.
 */
interface DataRowProps {
	/**
	 * Row label content (first column).
	 */
	label: React.ReactElement | string;

	/**
	 * Tooltip content to display via an info badge.
	 * If not provided, no info badge will be displayed.
	 */
	infoTooltipContent: React.ReactElement | string | undefined;

	/**
	 * The value text associated with the label (second column).
	 */
	value: React.ReactElement | string | undefined;

	/**
	 * Column props consumed by FluentUI.
	 *
	 * @privateRemarks `@fluentui/react-components` does not export the type we need here: `TableColumnSizingState`.
	 */
	columnProps: unknown;
}

/**
 * Displays a row with basic stats about the Container.
 */
function DataRow(props: DataRowProps): React.ReactElement {
	const { label, infoTooltipContent, value, columnProps } = props;

	return (
		<TableRow>
			<TableCell
				{
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					...(columnProps as any).getTableCellProps("containerProperty")
				}
			>
				{infoTooltipContent === undefined ? (
					<b>{label}</b>
				) : (
					<InfoLabel info={infoTooltipContent} style={{ whiteSpace: "nowrap" }}>
						<b>{label}</b>
					</InfoLabel>
				)}
			</TableCell>
			<TableCell>{value}</TableCell>
		</TableRow>
	);
}

function containerStatusValueCell(statusComponents: string[]): React.ReactElement {
	return (
		<TableCell>
			<TableCellLayout
				media={((): JSX.Element => {
					switch (statusComponents[0]) {
						case AttachState.Attaching:
							return (
								<Badge shape="rounded" color="warning">
									{statusComponents[0]}
								</Badge>
							);
						case AttachState.Detached:
							return (
								<Badge shape="rounded" color="danger">
									{statusComponents[0]}
								</Badge>
							);
						default:
							return (
								<Badge shape="rounded" color="success">
									{statusComponents[0]}
								</Badge>
							);
					}
				})()}
			>
				{statusComponents[1] === "Connected" ? (
					<Badge shape="rounded" color="success">
						{statusComponents[1]}
					</Badge>
				) : (
					<Badge shape="rounded" color="danger">
						{statusComponents[1]}
					</Badge>
				)}
			</TableCellLayout>
		</TableCell>
	);
}

/**
 * Debugger view displaying basic Container stats.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
	const { containerKey } = props;
	const items: Item[] = [];
	const messageRelay: IMessageRelay = useMessageRelay();

	const [containerState, setContainerState] = React.useState<
		ContainerStateMetadata | undefined
	>();

	const [columns] = React.useState<TableColumnDefinition<Item>[]>(columnsDef);
	const [columnSizingOptions] = React.useState<TableColumnSizingOptions>({
		containerProperty: {
			idealWidth: 70,
			minWidth: 70,
		},
	});

	const { columnSizing_unstable, tableRef } = useTableFeatures({ columns, items }, [
		useTableColumnSizing_unstable({ columnSizingOptions }),
	]);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerStateChange.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ContainerStateChange.Message;
				if (message.data.containerKey === containerKey) {
					setContainerState(message.data.containerState);
					return true;
				}
				return false;
			},
		};

		/**
		 * Event handler for messages coming from the webpage.
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: "ContainerSummaryView", // TODO: fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset state with Container data, to ensure we aren't displaying stale data (for the wrong container) while we
		// wait for a response to the message sent below. Especially relevant for the Container-related views because this
		// component wont be unloaded and reloaded if the user just changes the menu selection from one Container to another.
		setContainerState(undefined);

		// Request state info for the newly specified containerKey
		messageRelay.postMessage(GetContainerState.createMessage({ containerKey }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, setContainerState, messageRelay]);

	if (containerState === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
	}

	function tryConnect(): void {
		messageRelay.postMessage(
			ConnectContainer.createMessage({
				containerKey,
			}),
		);
	}

	function forceDisconnect(): void {
		messageRelay.postMessage(
			DisconnectContainer.createMessage({
				containerKey,
				/* TODO: Specify devtools reason here once it is supported */
			}),
		);
	}

	function closeContainer(): void {
		messageRelay.postMessage(
			CloseContainer.createMessage({
				containerKey,
				/* TODO: Specify devtools reason here once it is supported */
			}),
		);
	}

	// Build up status string
	const statusComponents: string[] = [];
	if (closed) {
		statusComponents.push("Closed");
	} else {
		statusComponents.push(containerState.attachState);
		if (containerState.attachState === AttachState.Attached) {
			statusComponents.push(connectionStateToString(containerState.connectionState));
		}
	}

	return (
		<Stack>
			<StackItem align="center">
				<h2>{containerState.containerKey}</h2>
			</StackItem>
			<StackItem>
				<Table size="extra-small" ref={tableRef}>
					<DataRow
						label="Status"
						infoTooltipContent={containerStatusTooltipText}
						value={containerStatusValueCell(statusComponents)}
						columnProps={columnSizing_unstable}
					/>
					<DataRow
						label="Client ID"
						infoTooltipContent={clientIdTooltipText}
						value={containerState.clientId}
						columnProps={columnSizing_unstable}
					/>
					<DataRow
						label="User ID"
						infoTooltipContent={userIdTooltipText}
						value={containerState.userId}
						columnProps={columnSizing_unstable}
					/>
				</Table>
			</StackItem>
			<StackItem align="start">
				<ActionsBar
					isContainerConnected={
						containerState.connectionState === ConnectionState.Connected
					}
					isContainerClosed={containerState.closed}
					tryConnect={tryConnect}
					forceDisconnect={forceDisconnect}
					closeContainer={closeContainer}
				/>
			</StackItem>
		</Stack>
	);
}

/**
 * Container actions supported by the debugger view.
 */
export interface IContainerActions {
	/**
	 * Attempt to connect a disconnected Container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	tryConnect?: () => void;

	/**
	 * Disconnect a connected Container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	forceDisconnect?: () => void;

	/**
	 * Close the container.
	 *
	 * @remarks Button controls will be disabled if this is not provided.
	 */
	closeContainer?: () => void;
}

interface ActionsBarProps extends IContainerActions {
	isContainerConnected: boolean;
	isContainerClosed: boolean;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
	const { isContainerConnected, isContainerClosed, tryConnect, forceDisconnect, closeContainer } =
		props;

	const changeConnectionStateButton = isContainerConnected ? (
		<Button
			size="small"
			icon={<PlugDisconnected20Regular />}
			onClick={forceDisconnect}
			disabled={forceDisconnect === undefined || isContainerClosed}
		>
			Disconnect Container
		</Button>
	) : (
		<Button
			size="small"
			icon={<PlugConnected20Regular />}
			onClick={tryConnect}
			disabled={tryConnect === undefined || isContainerClosed}
		>
			Connect Container
		</Button>
	);

	const disposeContainerButton = (
		<Button
			size="small"
			icon={<Delete20Regular />}
			onClick={closeContainer}
			disabled={closeContainer === undefined || isContainerClosed}
		>
			Close Container
		</Button>
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
