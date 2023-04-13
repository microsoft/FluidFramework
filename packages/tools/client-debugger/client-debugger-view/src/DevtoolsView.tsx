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
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-tools/client-debugger";

import { IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { FluentProvider } from "@fluentui/react-components";
import {
	ContainerDevtoolsView,
	TelemetryView,
	MenuItem,
	MenuSection,
	LandingView,
	Waiting,
} from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";
import { useMessageRelay } from "./MessageRelayContext";
import { getFluentUIThemeToUse } from "./ThemeHelper";

const loggingContext = "INLINE(DevtoolsView)";

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

// #region Styles definitions

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

// #endregion

/**
 * Primary Devtools view.
 * Communicates with {@link @fluid-tools/client-debugger#FluidDevtools} via {@link MessageRelayContext} to get
 * runtime-level stats to display, as well as the list of Container-level Devtools instances to display as menu options
 * and sub-views.
 */
export function DevtoolsView(): React.ReactElement {
	// Set of features supported by the Devtools.
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();

	const messageRelay = useMessageRelay();

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

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setSupportedFeatures]);

	return (
		<FluentProvider theme={getFluentUIThemeToUse()}>
			{supportedFeatures === undefined ? (
				<Waiting />
			) : (
				<_DevtoolsView supportedFeatures={supportedFeatures} />
			)}
		</FluentProvider>
	);
}

interface _DevtoolsViewProps {
	/**
	 * Set of features supported by the Devtools.
	 */
	supportedFeatures: DevtoolsFeatureFlags;
}

/**
 * Internal {@link DevtoolsView}, displayed once the supported feature set has been acquired from the webpage.
 */
function _DevtoolsView(props: _DevtoolsViewProps): React.ReactElement {
	const { supportedFeatures } = props;

	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection | undefined>();

	const messageRelay = useMessageRelay();

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

		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setContainers]);

	return (
		<Stack enableScopedSelectors horizontal styles={stackStyles}>
			<Menu
				currentSelection={menuSelection}
				setSelection={setMenuSelection}
				containers={containers}
				supportedFeatures={supportedFeatures}
			/>
			<View menuSelection={menuSelection} containers={containers} />
		</Stack>
	);
}

/**
 * {@link View} input props.
 */
interface ViewProps {
	/**
	 * The current menu selection.
	 *
	 * @remarks `undefined` indicates that the landing page should be displayed.
	 */
	menuSelection?: MenuSelection;

	/**
	 * The list of Containers, if any are registered with the webpage's Devtools instance.
	 */
	containers?: ContainerMetadata[];
}

/**
 * View body component used by {@link DevtoolsView}.
 */
function View(props: ViewProps): React.ReactElement {
	const { menuSelection, containers } = props;

	let view: React.ReactElement;
	switch (menuSelection?.type) {
		case "telemetryMenuSelection":
			view = <TelemetryView />;
			break;
		case "containerMenuSelection":
			// eslint-disable-next-line no-case-declarations
			const container = containers?.find((x) => x.id === menuSelection.containerId);
			view =
				container === undefined ? (
					<div>Could not find a Devtools instance for that container.</div>
				) : (
					<ContainerDevtoolsView containerId={menuSelection.containerId} />
				);
			break;
		default:
			view = <LandingView />;
			break;
	}

	return (
		<Stack.Item grow={5} styles={contentViewStyles}>
			<div
				id="devtools-view-content"
				style={{ width: "100%", height: "100%", overflowY: "auto" }}
			>
				{view}
			</div>
		</Stack.Item>
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
	supportedFeatures: DevtoolsFeatureFlags;

	/**
	 * The set of Containers to offer as selection options.
	 */
	containers?: ContainerMetadata[];
}

/**
 * Menu component for {@link DevtoolsView}.
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

	menuSections.push(
		<ContainersMenuSection
			containers={containers}
			currentContainerSelection={
				currentSelection?.type === "containerMenuSelection"
					? currentSelection.containerId
					: undefined
			}
			selectContainer={onContainerClicked}
		/>,
	);

	// Display the Telemetry menu section only if the corresponding Devtools instance supports telemetry messaging.
	if (supportedFeatures[DevtoolsFeature.Telemetry] === true) {
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
			{menuSections.length === 0 ? <Waiting /> : menuSections}
		</Stack.Item>
	);
}

/**
 * {@link ContainersMenuSection} input props.
 */
interface ContainersMenuSectionProps {
	/**
	 * The set of Containers to offer as selection options.
	 */
	containers?: ContainerMetadata[];

	/**
	 * The currently selected Container ID, if one is currently selected.
	 */
	currentContainerSelection: string | undefined;

	/**
	 * Updates the Container selection to the specified ID.
	 *
	 * @remarks Passing `undefined` clears the selection.
	 */
	selectContainer(containerId: string | undefined): void;
}

/**
 * Displays the Containers menu section, allowing the user to select the Container to display.
 *
 * @remarks Displays a spinner while the Container list is being loaded (if the list is undefined),
 * and displays a note when there are no registered Containers (if the list is empty).
 */
function ContainersMenuSection(props: ContainersMenuSectionProps): React.ReactElement {
	const { containers, selectContainer, currentContainerSelection } = props;

	let containerSectionInnerView: React.ReactElement;
	if (containers === undefined) {
		containerSectionInnerView = <Waiting label="Fetching Container list" />;
	} else if (containers.length === 0) {
		containerSectionInnerView = <div>No Containers found.</div>;
	} else {
		containerSectionInnerView = (
			<>
				{containers.map((container) => (
					<MenuItem
						key={container.id}
						isActive={currentContainerSelection === container.id}
						text={container.nickname ?? container.id}
						onClick={(event): void => {
							selectContainer(`${container.id}`);
						}}
					/>
				))}
			</>
		);
	}

	// TODO: add button to refresh list of containers
	return (
		<MenuSection header="Containers" key="container-selection-menu-section">
			{containerSectionInnerView}
		</MenuSection>
	);
}
