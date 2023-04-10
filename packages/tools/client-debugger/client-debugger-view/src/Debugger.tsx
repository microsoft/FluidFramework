/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import {
	ContainerList,
	ContainerMetadata,
	DevtoolsFeature,
	DevtoolsFeatureFlags,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	handleIncomingMessage,
	IMessageRelay,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-tools/client-debugger";

import { IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { FluentProvider } from "@fluentui/react-components";
import {
	ContainerView,
	TelemetryView,
	MenuItem,
	MenuSection,
	LandingView,
	Waiting,
} from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";
import { useMessageRelay } from "./MessageRelayContext";
import { getFluentUIThemeToUse } from "./ThemeHelper";

const loggingContext = "INLINE(DebuggerPanel)";

// Ensure FluentUI icons are initialized.
initializeFluentUiIcons();

/**
 * Message sent to the webpage to query for the supported set of Devtools features.
 */
const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();

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

/**
 * Renders drop down to show more than 2 containers and manage the selected container in the debug view for an active
 * debugger session registered using {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebuggers(): React.ReactElement {
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection | undefined>();

	const messageRelay: IMessageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: (untypedMessage) => {
				const message = untypedMessage as DevtoolsFeatures.Message;
				setSupportedFeatures(message.data.features);
				return true;
			},
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

		// Query for supported feature set
		messageRelay.postMessage(getSupportedFeaturesMessage);

		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setSupportedFeatures, setContainers]);

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

	return (
		<FluentProvider theme={getFluentUIThemeToUse()}>
			<Stack enableScopedSelectors horizontal styles={stackStyles}>
				<Menu
					currentSelection={menuSelection}
					setSelection={setMenuSelection}
					containers={containers}
					supportedFeatures={supportedFeatures}
				/>
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

/**
 * {@link Menu} input props.
 */
interface MenuProps {
	/**
	 * The current menu selection (if any).
	 */
	currentSelection?: MenuSelection;

	/**
	 * Sets the menu selection to the specified value.
	 *
	 * @remarks Passing `undefined` clears the selection.
	 */
	setSelection(newSelection: MenuSelection | undefined): void;

	/**
	 * Set of features supported by the {@link FluidDevtools} instance being used by the page application.
	 */
	supportedFeatures?: DevtoolsFeatureFlags;

	/**
	 * The set of Containers to offer as selection options.
	 */
	containers?: ContainerMetadata[];
}

/**
 * Menu component for {@link FluidClientDebuggers}.
 */
function Menu(props: MenuProps): React.ReactElement {
	const { currentSelection, setSelection, supportedFeatures, containers } = props;

	function onContainerClicked(id: string): void {
		setSelection({ type: "containerMenuSelection", containerId: id });
	}

	function onTelemetryClicked(): void {
		setSelection({ type: "telemetryMenuSelection" });
	}

	const menuSections: React.ReactElement[] = [];

	// Display the Containers menu section only if we have a non-empty Container list.
	if (containers !== undefined && containers.length > 0) {
		menuSections.push(
			<MenuSection header="Containers" key="container-selection-menu-section">
				{containers.map((container) => (
					<MenuItem
						key={container.id}
						isActive={
							currentSelection?.type === "containerMenuSelection" &&
							currentSelection.containerId === container.id
						}
						text={container.nickname ?? container.id}
						onClick={(event): void => {
							onContainerClicked(`${container.id}`);
						}}
					/>
				))}
			</MenuSection>,
		);
	}

	// Display the Telemetry menu section only if the corresponding Devtools instance supports telemetry messaging.
	if (supportedFeatures?.[DevtoolsFeature.Telemetry] === true) {
		menuSections.push(
			<MenuSection header="Telemetry" key="telemetry-menu-section">
				<MenuItem
					isActive={currentSelection?.type === "telemetryMenuSelection"}
					text="See Telemetry"
					onClick={onTelemetryClicked}
				/>
			</MenuSection>,
		);
	}

	return (
		<Stack.Item grow={1} styles={menuStyles}>
			{/* TODO: button to refresh list of containers */}
			{menuSections.length === 0 ? <Waiting /> : menuSections}
		</Stack.Item>
	);
}
