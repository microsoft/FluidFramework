/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Badge,
	Button,
	InfoLabel,
	Table,
	TableBody,
	TableCell,
	TableCellLayout,
	type TableColumnDefinition,
	type TableColumnSizingOptions,
	TableRow,
	createTableColumn,
	makeStyles,
	shorthands,
	useTableColumnSizing_unstable,
	useTableFeatures,
} from "@fluentui/react-components";
import {
	Delete20Regular,
	PlugConnected20Regular,
	PlugDisconnected20Regular,
} from "@fluentui/react-icons";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	CloseContainer,
	ConnectContainer,
	ContainerStateChange,
	type ContainerStateMetadata,
	DisconnectContainer,
	GetContainerState,
	type HasContainerKey,
	type IMessageRelay,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";
import { useLogger } from "../TelemetryUtils.js";
import { connectionStateToString } from "../Utilities.js";

import {
	clientIdTooltipText,
	containerStatusTooltipText,
	userIdTooltipText,
} from "./TooltipTexts.js";
import { Waiting } from "./Waiting.js";

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
 *
 * @remarks {@link DataRowProps.value} will be wrapped in a <TableCell /> so it shouldn't have one itself.
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
		<TableCellLayout
			media={((): JSX.Element => {
				switch (statusComponents[0]) {
					case AttachState.Attaching: {
						return (
							<Badge shape="rounded" color="warning">
								{statusComponents[0]}
							</Badge>
						);
					}
					case AttachState.Detached: {
						return (
							<Badge shape="rounded" color="danger">
								{statusComponents[0]}
							</Badge>
						);
					}
					default: {
						return (
							<Badge shape="rounded" color="success">
								{statusComponents[0]}
							</Badge>
						);
					}
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

const useContainerSummaryViewStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
	},
	title: {
		alignSelf: "center",
	},
	actions: {
		alignSelf: "start",
	},
});

/**
 * View displaying a simple summary of the Container state.
 */
export function ContainerSummaryView(props: ContainerSummaryViewProps): React.ReactElement {
	const { containerKey } = props;
	const items: Item[] = [];
	const messageRelay: IMessageRelay = useMessageRelay();
	const usageLogger = useLogger();

	const styles = useContainerSummaryViewStyles();

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
		usageLogger?.sendTelemetryEvent({ eventName: "ConnectContainerButtonClicked" });
	}

	function forceDisconnect(): void {
		messageRelay.postMessage(
			DisconnectContainer.createMessage({
				containerKey,
				/* TODO: Specify devtools reason here once it is supported */
			}),
		);
		usageLogger?.sendTelemetryEvent({ eventName: "DisconnectContainerButtonClicked" });
	}

	function closeContainer(): void {
		messageRelay.postMessage(
			CloseContainer.createMessage({
				containerKey,
				/* TODO: Specify devtools reason here once it is supported */
			}),
		);
		usageLogger?.sendTelemetryEvent({ eventName: "CloseContainerButtonClicked" });
	}

	// Build up status string
	const statusComponents: string[] = [];
	if (closed) {
		statusComponents.push("Closed");
	} else {
		statusComponents.push(containerState.attachState);
		if (containerState.attachState === AttachState.Attached) {
			statusComponents.push(connectionStateToString(containerState.connectionState));
		} else {
			/*
			 * If the container is not attached, it is not connected
			 * TODO: If the container is detached, it is advisable to disable the action buttons
			 * since Fluid will consistently fail to establish a connection with a detached container.
			 */
			statusComponents.push(connectionStateToString(ConnectionState.Disconnected));
		}
	}

	return (
		<div className={styles.root}>
			<div className={styles.title}>
				<h2>{containerState.containerKey}</h2>
			</div>
			<div>
				<Table size="extra-small" ref={tableRef}>
					<TableBody>
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
					</TableBody>
				</Table>
			</div>
			<div className={styles.actions}>
				<ActionsBar
					isContainerConnected={containerState.connectionState === ConnectionState.Connected}
					containerState={containerState}
					tryConnect={tryConnect}
					forceDisconnect={forceDisconnect}
					closeContainer={closeContainer}
				/>
			</div>
		</div>
	);
}

/**
 * Container actions supported by the devtools view.
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

const useActionBarStyles = makeStyles({
	root: {
		...shorthands.padding("5px"),
		display: "flex",
		flexDirection: "row",
	},
});

interface ActionsBarProps extends IContainerActions {
	isContainerConnected: boolean;
	containerState: ContainerStateMetadata;
}

function ActionsBar(props: ActionsBarProps): React.ReactElement {
	const { isContainerConnected, containerState, tryConnect, forceDisconnect, closeContainer } =
		props;
	const styles = useActionBarStyles();

	const changeConnectionStateButton = isContainerConnected ? (
		<Button
			size="small"
			icon={<PlugDisconnected20Regular />}
			onClick={forceDisconnect}
			disabled={forceDisconnect === undefined || containerState.closed}
		>
			Disconnect Container
		</Button>
	) : (
		<Button
			size="small"
			icon={<PlugConnected20Regular />}
			onClick={tryConnect}
			disabled={
				tryConnect === undefined ||
				containerState.closed ||
				containerState.attachState === AttachState.Detached
			}
		>
			Connect Container
		</Button>
	);

	const disposeContainerButton = (
		<Button
			size="small"
			icon={<Delete20Regular />}
			onClick={closeContainer}
			disabled={
				closeContainer === undefined ||
				containerState.closed ||
				containerState.attachState === AttachState.Detached
			}
		>
			Close Container
		</Button>
	);

	return (
		<div className={styles.root}>
			{changeConnectionStateButton}
			{disposeContainerButton}
		</div>
	);
}
