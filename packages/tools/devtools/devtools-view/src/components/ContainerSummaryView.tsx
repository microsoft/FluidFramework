/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IStackItemStyles, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
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
import { InfoBadge } from "./utility-components";
import { clientIdTooltipText, containerStatusTooltipText, userIdTooltipText } from "./TooltipTexts";

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

// TODOs:
// - Add info tooltips (with question mark icons?) for each piece of Container status info to
//   help education consumers as to what the different statuses mean.

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
 * Displays a row with basic stats about the Container.
 *
 * @param label - Row label text.
 * @param infoTooltipText - (optional) Tooltip text to display via an info badge.
 * No badge will be displayed if this text is not provided.
 * @param value - The value text associated with the label.
 * @param columnProps - Column props consumed by FluentUI.
 */
function DataRow(
	label: string,
	infoTooltipText: string | undefined,
	value: React.ReactElement | string | undefined,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	columnProps: any,
): React.ReactElement {
	return (
		<TableRow>
			<TableCell
				{
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
					...columnProps.getTableCellProps("containerProperty")
				}
			>
				<span
					style={{
						whiteSpace: "nowrap",
					}}
				>
					<b>{label}</b>
					{infoTooltipText === undefined ? (
						<></>
					) : (
						<InfoBadge tooltipContent={infoTooltipText} />
					)}
				</span>
			</TableCell>
			<TableCell>{value}</TableCell>
		</TableRow>
	);
}

function containerStatusValueCell(statusComponents: string[]): React.ReactElement {
	return (
		<TableCellLayout
			media={((): JSX.Element => {
				switch (statusComponents[0]) {
					case "attaching":
						return (
							<Badge shape="rounded" color="warning">
								{statusComponents[0]}
							</Badge>
						);
					case "detached":
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
			[ContainerStateChange.MessageType]: (untypedMessage) => {
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
		// eslint-disable-next-line unicorn/no-useless-undefined
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
					{DataRow(
						"Status",
						containerStatusTooltipText,
						containerStatusValueCell(statusComponents),
						columnSizing_unstable,
					)}
					{DataRow(
						"Client ID",
						clientIdTooltipText,
						containerState.clientId,
						columnSizing_unstable,
					)}
					{DataRow(
						"User ID",
						userIdTooltipText,
						containerState.userId,
						columnSizing_unstable,
					)}
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

	const connectButtonTooltipId = useId("connect-button-tooltip");
	const disconnectButtonTooltipId = useId("disconnect-button-tooltip");
	const disposeContainerButtonTooltipId = useId("dispose-container-button-tooltip");

	const changeConnectionStateButton = isContainerConnected ? (
		<TooltipHost content="Disconnect Container" id={disconnectButtonTooltipId}>
			<Button
				size="small"
				icon={<PlugDisconnected20Regular />}
				onClick={forceDisconnect}
				disabled={forceDisconnect === undefined || isContainerClosed}
			>
				Disconnect Container
			</Button>
		</TooltipHost>
	) : (
		<TooltipHost content="Connect Container" id={connectButtonTooltipId}>
			<Button
				size="small"
				icon={<PlugConnected20Regular />}
				onClick={tryConnect}
				disabled={tryConnect === undefined || isContainerClosed}
			>
				Connect Container
			</Button>
		</TooltipHost>
	);

	const disposeContainerButton = (
		<TooltipHost content="Close Container" id={disposeContainerButtonTooltipId}>
			<Button
				size="small"
				icon={<Delete20Regular />}
				onClick={closeContainer}
				disabled={closeContainer === undefined || isContainerClosed}
			>
				Close Container
			</Button>
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
