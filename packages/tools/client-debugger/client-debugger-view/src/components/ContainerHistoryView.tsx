/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import {
	Divider,
	tokens,
	TableBody,
	TableCell,
	TableRow,
	Table,
	TableHeader,
	TableHeaderCell,
} from "@fluentui/react-components";
import {
	Clock20Regular,
	PlugConnected24Regular,
	Attach24Regular,
	PlugDisconnected24Regular,
	ErrorCircle24Regular,
	Info24Regular,
  } from "@fluentui/react-icons";
  import {
	ConnectionStateChangeLogEntry,
	ContainerStateHistory,
	GetContainerState,
	handleIncomingMessage,
	HasContainerId,
	ISourcedDevtoolsMessage,
	InboundHandlers,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";

/**
 * {@link ContainerHistoryView} input props.
 */
export type ContainerHistoryProps = HasContainerId;

/**
 * Displays information about the container state history.
 *
 * @param props - See {@link ContainerHistoryViewProps}.
 */
export function ContainerHistoryView(props: ContainerHistoryProps): React.ReactElement {
	const { containerId } = props;
	const messageRelay = useMessageRelay();

	const [containerHistory, setContainerHistory] = React.useState<
		readonly ConnectionStateChangeLogEntry[] | undefined
	>();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerStateHistory.MessageType]: (untypedMessage) => {
				const message = untypedMessage as ContainerStateHistory.Message;
				if (message.data.containerId === containerId) {
					setContainerHistory(message.data.history);
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
				context: "ContainerHistoryView", // TODO: Fix
			});
		}

		messageRelay.on("message", messageHandler);

		// Reset state with Container data, to ensure we aren't displaying stale data (for the wrong container) while we
		// wait for a response to the message sent below. Especially relevant for the Container-related views because this
		// component wont be unloaded and reloaded if the user just changes the menu selection from one Container to another.
		// eslint-disable-next-line unicorn/no-useless-undefined
		setContainerHistory(undefined);

		// Request state info for the newly specified containerId
		messageRelay.postMessage(GetContainerState.createMessage({ containerId }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, messageRelay, setContainerHistory]);

	if (containerHistory === undefined) {
		return <Waiting label="Waiting for Container Summary data." />;
	}

	// Columns for rendering audience history
	const containerHistoryColumns = [
		{ columnKey: "state", label: "State" },
		{ columnKey: "time", label: "Time" },
	];

	const getBackgroundColorForState = (state: string): string => {
		switch (state) {
			case "connected":
				return tokens.colorPaletteGreenBackground2; // green
			case "disconnected":
				return tokens.colorPaletteDarkOrangeBorderActive; // orange
			case "closed":
				return tokens.colorPaletteRedBorder1; // red
			case "disposed":
				return tokens.colorPaletteDarkRedBackground2; // dark red
			case "attached":
				return tokens.colorPaletteRoyalBlueBackground2; // blue
			default:
				console.log("Unknown state type for container!");
				return tokens.colorBrandBackgroundPressed; // black
		}
	};

	return (
		<>
			<Divider appearance="brand"> Container State Log </Divider>
			<Table size="small" aria-label="Audience history table">
				<TableHeader>
					<TableRow>
						{containerHistoryColumns.map((column, columnIndex) => (
							<TableHeaderCell key={columnIndex}>
								{column.columnKey === "state" && <PlugConnected24Regular />}
								{column.columnKey === "time" && <Clock20Regular />}
								{column.label}
							</TableHeaderCell>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{containerHistory.map((item, itemIndex) => {
						const nowTimeStamp = new Date();
						const changeTimeStamp = new Date(item.timestamp);
						const wasChangeToday = nowTimeStamp.getDate() === changeTimeStamp.getDate();

						const timestampDisplay = wasChangeToday
							? changeTimeStamp.toTimeString()
							: changeTimeStamp.toDateString();

							const getStateIcon = (state: string): React.ReactElement => {
								switch (state) {
								  case "connected":
									return <PlugConnected24Regular />;
								  case "attached":
									return <Attach24Regular />;
								  case "disconnected":
									return <PlugDisconnected24Regular />;
								  case "disposed":
									return <ErrorCircle24Regular />;
								  case "closed":
									return <Info24Regular />;
								  default:
									console.log("Unknown state type for container!");
									return <Info24Regular />;
								}
							  };
							  
						return (
							<TableRow
								key={itemIndex}
								style={{
									backgroundColor: getBackgroundColorForState(item.newState),
								}}
							>
								<TableCell>
									{getStateIcon(item.newState)}
									{item.newState}
								</TableCell>
								<TableCell>{timestampDisplay}</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</>
	);
}