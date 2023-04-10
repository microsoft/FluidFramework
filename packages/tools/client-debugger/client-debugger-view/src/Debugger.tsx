/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	ContainerList,
	ContainerMetadata,
	GetContainerList,
	handleIncomingMessage,
	IMessageRelay,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-tools/client-debugger";

import { IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { FluentProvider } from "@fluentui/react-components";
import { ContainerView, TelemetryView, MenuItem, MenuSection, LandingView } from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";
import { useMessageRelay } from "./MessageRelayContext";
import { getFluentUIThemeToUse } from "./ThemeHelper";

const loggingContext = "INLINE(DebuggerPanel)";

// Ensure FluentUI icons are initialized.
initializeFluentUiIcons();

/**
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage = GetContainerList.createMessage();

/**
 * Indicates that the currently selected menu option is a particular Container.
 * @see {@link MenuSection} for other possible options.
 */
interface ContainerMenuSelection {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "containerMenuSelection";

	/**
	 * The containerId for the selected menu option that this object represents.
	 */
	containerId: string;
}

/**
 * Indicates that the currently selected menu option is the Telemetry view.
 * @see {@link MenuSection} for other possible options.
 */
interface TelemetryMenuSelection {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "telemetryMenuSelection";
}

/**
 * Discriminated union type for all the selectable options in the menu.
 * Each specific type should contain any additional information it requires.
 * E.g. {@link ContainerMenuSelection} represents that the menu option for a Container
 * is selected, and has a 'containerId' property to indicate which Container.
 */
type MenuSelection = TelemetryMenuSelection | ContainerMenuSelection;

/**
 * Renders drop down to show more than 2 containers and manage the selected container in the debug view for an active
 * debugger session registered using {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebuggers(): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection | undefined>();

	const messageRelay: IMessageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerList.MessageType]: (untypedMessage) => {
				const message = untypedMessage as ContainerList.Message;
				setContainers(message.data.containers);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [setContainers, messageRelay]);

	let innerView: React.ReactElement;
	switch (menuSelection?.type) {
		case "telemetryMenuSelection":
			innerView = <TelemetryView />;
			break;
		case "containerMenuSelection":
			// eslint-disable-next-line no-case-declarations
			const container = containers?.find((x) => x.id === menuSelection.containerId);
			innerView =
				container === undefined ? (
					<div>Could not find a debugger for that container.</div>
				) : (
					<ContainerView containerId={menuSelection.containerId} />
				);
			break;
		default:
			innerView = <LandingView />;
			break;
	}

	// Styles definition
	const stackStyles: IStackStyles = {
		root: {
			"display": "flex",
			"flexDirection": "row",
			"flexWrap": "nowrap",
			"width": "auto",
			"height": "auto",
			"boxSizing": "border-box",
			"> *": {
				textOverflow: "ellipsis",
			},
			"> :not(:first-child)": {
				marginTop: "0px",
			},
			"> *:not(.ms-StackItem)": {
				flexShrink: 1,
			},
		},
	};
	const contentViewStyles: IStackItemStyles = {
		root: {
			"alignItems": "center",
			"display": "flex",
			"justifyContent": "center",
			"flexDirection": "column",
			"flexWrap": "nowrap",
			"width": "auto",
			"height": "auto",
			"boxSizing": "border-box",
			"> *": {
				textOverflow: "ellipsis",
			},
			"> :not(:first-child)": {
				marginTop: "0px",
			},
			"> *:not(.ms-StackItem)": {
				flexShrink: 1,
			},
		},
	};

	const menuStyles: IStackItemStyles = {
		root: {
			...contentViewStyles,
			display: "flex",
			flexDirection: "column",
			borderRight: `2px solid`,
			minWidth: 150,
		},
	};

	function onContainerClicked(id: string): void {
		setMenuSelection({ type: "containerMenuSelection", containerId: id });
	}

	function onTelemetryClicked(): void {
		setMenuSelection({ type: "telemetryMenuSelection" });
	}

	return (
		<FluentProvider theme={getFluentUIThemeToUse()}>
			<Stack enableScopedSelectors horizontal styles={stackStyles}>
				<Stack.Item grow={1} styles={menuStyles}>
					{/* TODO: button to refresh list of containers */}
					<MenuSection header="Containers">
						{containers?.map((container) => (
							<MenuItem
								key={container.id}
								isActive={
									menuSelection?.type === "containerMenuSelection" &&
									menuSelection.containerId === container.id
								}
								text={container.nickname ?? container.id}
								onClick={(event): void => {
									onContainerClicked(`${container.id}`);
								}}
							/>
						))}
					</MenuSection>
					<MenuSection header="Telemetry">
						<MenuItem
							isActive={menuSelection?.type === "telemetryMenuSelection"}
							text="See Telemetry"
							onClick={onTelemetryClicked}
						/>
					</MenuSection>
				</Stack.Item>
				<Stack.Item grow={5} styles={contentViewStyles}>
					<div
						id="debugger-view-content"
						style={{ width: "100%", height: "100%", overflowY: "auto" }}
					>
						{innerView}
					</div>
				</Stack.Item>
			</Stack>
		</FluentProvider>
	);
}
