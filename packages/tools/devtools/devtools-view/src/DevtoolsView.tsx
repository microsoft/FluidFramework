/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { Button, FluentProvider, Tooltip, Theme } from "@fluentui/react-components";
import { ArrowSync24Regular, Settings20Regular } from "@fluentui/react-icons";

import {
	ContainerKey,
	ContainerList,
	DevtoolsFeature,
	DevtoolsFeatureFlags,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	handleIncomingMessage,
	HasContainerKey,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluid-experimental/devtools-core";
import {
	ContainerDevtoolsView,
	TelemetryView,
	MenuItem,
	MenuSection,
	LandingView,
	SettingsView,
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
interface ContainerMenuSelection extends HasContainerKey {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "containerMenuSelection";
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
 * Indicates that the currently selected menu option is the Settings view.
 * @see {@link MenuSection} for other possible options.
 */
interface SettingsMenuSelection {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "settingsMenuSelection";
}

/**
 * Discriminated union type for all the selectable options in the menu.
 * Each specific type should contain any additional information it requires.
 * E.g. {@link ContainerMenuSelection} represents that the menu option for a Container
 * is selected, and has a 'containerKey' property to indicate which Container.
 */
type MenuSelection = TelemetryMenuSelection | ContainerMenuSelection | SettingsMenuSelection;

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
		"display": "flex",
		"flexDirection": "column",
		"borderRight": `2px solid`,
		"minWidth": "150px",
		"maxHeight": "350px",
		// Ensures the last div/component is anchored to the bottom.
		"> :last-child": {
			marginTop: "auto",
		},
	},
};

// #endregion

/**
 * Primary Devtools view.
 * Communicates with {@link @fluid-experimental/devtools-core#FluidDevtools} via {@link MessageRelayContext} to get
 * runtime-level stats to display, as well as the list of Container-level Devtools instances to display as menu options
 * and sub-views.
 */
export function DevtoolsView(): React.ReactElement {
	// Set of features supported by the Devtools.
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();
	const [queryTimedOut, setQueryTimedOut] = React.useState(false);
	const [selectedTheme, setSelectedTheme] = React.useState(getFluentUIThemeToUse());

	const queryTimeoutInMilliseconds = 30_000; // 30 seconds
	const messageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
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

	// Manage the query timeout
	React.useEffect(() => {
		if (supportedFeatures === undefined) {
			// If we have queried for the supported feature list but have not received
			// a response yet, queue a timer.
			const queryTimer = setTimeout(() => {
				setQueryTimedOut(true);
			}, queryTimeoutInMilliseconds);
			return (): void => {
				clearTimeout(queryTimer);
			};
		}
	}, [supportedFeatures, setQueryTimedOut]);

	function retryQuery(): void {
		setQueryTimedOut(false);
		messageRelay.postMessage(getSupportedFeaturesMessage);
	}

	return (
		<FluentProvider theme={selectedTheme} style={{ height: "100%" }}>
			{supportedFeatures === undefined ? (
				queryTimedOut ? (
					<>
						<div>Devtools not found. Timeout exceeded.</div>
						<Tooltip content="Retry searching for Devtools" relationship="description">
							<Button onClick={retryQuery}>Search again</Button>
						</Tooltip>
					</>
				) : (
					<Waiting />
				)
			) : (
				<_DevtoolsView setTheme={setSelectedTheme} supportedFeatures={supportedFeatures} />
			)}
		</FluentProvider>
	);
}

interface _DevtoolsViewProps {
	/**
	 * Sets the theme of the DevTools app (light, dark, high contrast)
	 */
	setTheme(newTheme: Theme): void;

	/**
	 * Set of features supported by the Devtools.
	 */
	supportedFeatures: DevtoolsFeatureFlags;
}

/**
 * Internal {@link DevtoolsView}, displayed once the supported feature set has been acquired from the webpage.
 */
function _DevtoolsView(props: _DevtoolsViewProps): React.ReactElement {
	const { supportedFeatures, setTheme } = props;

	const [containers, setContainers] = React.useState<ContainerKey[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection | undefined>();
	const messageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerList.MessageType]: async (untypedMessage) => {
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
			<View menuSelection={menuSelection} containers={containers} setTheme={setTheme} />
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
	containers?: ContainerKey[];

	/**
	 * Sets the theme of the DevTools app (light, dark, high contrast)
	 */
	setTheme(newTheme: Theme): void;
}

/**
 * View body component used by {@link DevtoolsView}.
 */
function View(props: ViewProps): React.ReactElement {
	const { menuSelection, containers, setTheme } = props;

	let view: React.ReactElement;
	switch (menuSelection?.type) {
		case "telemetryMenuSelection":
			view = <TelemetryView />;
			break;
		case "containerMenuSelection":
			// eslint-disable-next-line no-case-declarations
			const container: ContainerKey | undefined = containers?.find(
				(containerKey) => containerKey === menuSelection.containerKey,
			);
			view =
				container === undefined ? (
					<div>Could not find a Devtools instance for that container.</div>
				) : (
					<ContainerDevtoolsView containerKey={menuSelection.containerKey} />
				);
			break;
		case "settingsMenuSelection":
			view = <SettingsView setTheme={setTheme} />;
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
	 * Set of features supported by the {@link @fluid-experimental/devtools-core#IFluidDevtools}
	 * instance being used by the page application.
	 */
	supportedFeatures: DevtoolsFeatureFlags;

	/**
	 * The set of Containers to offer as selection options.
	 */
	containers?: ContainerKey[];
}

/**
 * Menu component for {@link DevtoolsView}.
 */
function Menu(props: MenuProps): React.ReactElement {
	const { currentSelection, setSelection, supportedFeatures, containers } = props;

	function onContainerClicked(containerKey: ContainerKey): void {
		setSelection({ type: "containerMenuSelection", containerKey });
	}

	function onTelemetryClicked(): void {
		setSelection({ type: "telemetryMenuSelection" });
	}

	function onSettingsClicked(): void {
		setSelection({ type: "settingsMenuSelection" });
	}

	const menuSections: React.ReactElement[] = [];

	menuSections.push(
		<ContainersMenuSection
			key="containers-menu-section"
			containers={containers}
			currentContainerSelection={
				currentSelection?.type === "containerMenuSelection"
					? currentSelection.containerKey
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
					text="Events"
					onClick={onTelemetryClicked}
				/>
			</MenuSection>,
		);
	}
	return (
		<Stack.Item styles={menuStyles}>
			{menuSections.length === 0 ? <Waiting /> : menuSections}
			<div
				style={{
					minWidth: "250px",
					display: "flex",
					cursor: "pointer",
				}}
				onClick={onSettingsClicked}
			>
				<h4 style={{ margin: "0px 5px" }}>Settings</h4>
				<Settings20Regular />
			</div>
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
	containers?: ContainerKey[];

	/**
	 * The currently selected Container key, if one is currently selected.
	 */
	currentContainerSelection: ContainerKey | undefined;

	/**
	 * Updates the Container selection to the specified key.
	 *
	 * @remarks Passing `undefined` clears the selection.
	 */
	selectContainer(containerKey: ContainerKey | undefined): void;
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
		containers.sort((a: string, b: string) => a.localeCompare(b));
		containerSectionInnerView = (
			<>
				{containers.map((containerKey: string) => (
					<MenuItem
						key={containerKey}
						isActive={currentContainerSelection === containerKey}
						text={containerKey}
						onClick={(event): void => {
							selectContainer(`${containerKey}`);
						}}
					/>
				))}
			</>
		);
	}

	return (
		<MenuSection
			header="Containers"
			key="container-selection-menu-section"
			icon={<RefreshButton />}
		>
			{containerSectionInnerView}
		</MenuSection>
	);
}

/**
 * A refresh button to retrieve the latest list of containers.
 */
function RefreshButton(): React.ReactElement {
	const messageRelay = useMessageRelay();

	const transparentButtonStyle = {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
	};

	function handleRefreshClick(): void {
		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);
	}

	return (
		<Tooltip content="Refresh Containers list" relationship="label">
			<Button
				icon={<ArrowSync24Regular />}
				style={transparentButtonStyle}
				onClick={handleRefreshClick}
				aria-label="Refresh Containers list"
			></Button>
		</Tooltip>
	);
}
