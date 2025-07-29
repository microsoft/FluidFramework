/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Button,
	makeStyles,
	mergeClasses,
	shorthands,
	tokens,
	Tooltip,
} from "@fluentui/react-components";
import {
	ArrowSync24Regular,
	Info24Regular,
	Dismiss24Regular,
	PlugDisconnected20Regular,
} from "@fluentui/react-icons";
import { ConnectionState } from "@fluidframework/container-loader";
import type {
	HasContainerKey,
	DevtoolsFeatureFlags,
	ContainerKey,
	ContainerStateMetadata,
	InboundHandlers,
	ISourcedDevtoolsMessage,
} from "@fluidframework/devtools-core/internal";
import {
	GetContainerList,
	GetContainerState,
	ContainerStateChange,
	RemoveContainer,
	handleIncomingMessage,
	DataVisualization,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";
import { useLogger } from "../TelemetryUtils.js";

import { containersInfoTooltipText, dataObjectsInfoTooltipText } from "./TooltipTexts.js";

import { Waiting } from "./index.js";

const BLINK_ANIMATION_DURATION = 600; // Duration for blinking animation in milliseconds

const useMenuStyles = makeStyles({
	root: {
		...shorthands.gap("0px", "10px"),
		...shorthands.padding("10px"),
		"boxSizing": "border-box",
		"display": "flex",
		"flexDirection": "column",
		"height": "100%",
		"overflowY": "auto",
		"minWidth": "150px",
		// Ensures the last div/component is anchored to the bottom.
		"> :last-child": {
			marginTop: "auto",
			marginBottom: "15px",
		},
	},

	// TODO: dedupe with MenuItem
	button: {
		"alignItems": "center",
		"cursor": "pointer",
		"display": "flex",
		"flexDirection": "row",
		"paddingLeft": "5px",
		"&:hover": {
			color: tokens.colorNeutralForeground1Hover,
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
});

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
 * Indicates that the currently selected menu option is the Home view.
 * @see {@link MenuSection} for other possible options.
 */
interface HomeMenuSelection {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "homeMenuSelection";
}

/**
 * Indicates that the currently selected menu option is the Op Latency view
 * @see {@link MenuSection} for other possible options.
 */
interface OpLatencyMenuSelection {
	/**
	 * String to differentiate between different types of options in menu.
	 */
	type: "opLatencyMenuSelection";
}

/**
 * Discriminated union type for all the selectable options in the menu.
 * Each specific type should contain any additional information it requires.
 * E.g. {@link ContainerMenuSelection} represents that the menu option for a Container
 * is selected, and has a 'containerKey' property to indicate which Container.
 */
export type MenuSelection =
	| TelemetryMenuSelection
	| ContainerMenuSelection
	| SettingsMenuSelection
	| HomeMenuSelection
	| OpLatencyMenuSelection;

/**
 * A refresh button to retrieve the latest list of containers or data objects.
 */
function RefreshButton(props: { label: string }): React.ReactElement {
	const messageRelay = useMessageRelay();
	const usageLogger = useLogger();

	const transparentButtonStyle = {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
	};

	function handleRefreshClick(): void {
		messageRelay.postMessage(GetContainerList.createMessage());
		usageLogger?.sendTelemetryEvent({ eventName: "RefreshContainerListButtonClicked" });
	}

	return (
		<Tooltip content={`Refresh ${props.label} list`} relationship="label">
			<Button
				icon={<ArrowSync24Regular />}
				style={transparentButtonStyle}
				onClick={handleRefreshClick}
				aria-label={`Refresh ${props.label} list`}
			/>
		</Tooltip>
	);
}

/**
 * An info icon with tooltip explaining what the section contains.
 */
function InfoIcon(props: { content: React.ReactElement }): React.ReactElement {
	const transparentButtonStyle = {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
	};

	return (
		<Tooltip content={props.content} relationship="label">
			<Button
				icon={<Info24Regular />}
				style={transparentButtonStyle}
				aria-label="Information"
			></Button>
		</Tooltip>
	);
}

/**
 * Props for {@link MenuSection}
 */
export type MenuSectionProps = React.PropsWithChildren<{
	/**
	 * Section header.
	 */
	header: React.ReactElement;
}>;

const useMenuSectionStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
	},
});

/**
 * Generic component for a section of the menu.
 */
export function MenuSection(props: MenuSectionProps): React.ReactElement {
	const { header, children } = props;

	const styles = useMenuSectionStyles();

	return (
		<div className={styles.root}>
			{header}
			{children}
		</div>
	);
}

/**
 * Props for {@link MenuSectionLabelHeader}
 */
export interface MenuSectionLabelHeaderProps {
	/**
	 * The text to display in header of the menu section.
	 */
	label: string;

	/**
	 * The icon or icons to display in the header of the menu section.
	 */
	icon?: React.ReactElement | React.ReactElement[];
}

const useMenuSectionLabelHeaderStyles = makeStyles({
	root: {
		alignItems: "center",
		display: "flex",
		flexDirection: "row",
		fontWeight: "bold",
	},
});

/**
 * Simple menu section header with a label.
 */
export function MenuSectionLabelHeader(
	props: MenuSectionLabelHeaderProps,
): React.ReactElement {
	const { label, icon } = props;
	const styles = useMenuSectionLabelHeaderStyles();

	return (
		<div className={styles.root}>
			{label}
			{Array.isArray(icon)
				? icon.map((i, index) => <React.Fragment key={index}>{i}</React.Fragment>)
				: icon}
		</div>
	);
}

/**
 * Props for {@link MenuSectionButtonHeader}
 */
export interface MenuSectionButtonHeaderProps extends MenuSectionLabelHeaderProps {
	/**
	 * Callback function that runs when the header is clicked.
	 */
	onClick?(): void;

	/**
	 * Button alt text.
	 */
	altText: string;

	/**
	 * Whether or not this selectable heading is the current selection.
	 */
	isActive: boolean;
}

const useMenuSectionButtonHeaderStyles = makeStyles({
	root: {
		alignItems: "center",
		display: "flex",
		flexDirection: "row",
		fontWeight: "bold",
		cursor: "pointer",
		"&:hover": {
			color: tokens.colorNeutralForeground1Hover,
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	active: {
		color: tokens.colorNeutralForeground1Selected,
		backgroundColor: tokens.colorNeutralBackground1Selected,
	},
	inactive: {
		color: tokens.colorNeutralForeground1,
		backgroundColor: tokens.colorNeutralBackground1,
	},
});

/**
 * Menu section header that behaves like a button.
 */
export function MenuSectionButtonHeader(
	props: MenuSectionButtonHeaderProps,
): React.ReactElement {
	const { label, icon, onClick, altText, isActive } = props;
	const styles = useMenuSectionButtonHeaderStyles();
	const style = mergeClasses(styles.root, isActive ? styles.active : styles.inactive);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if ((event.key === "Enter" || event.key === " ") && onClick) {
			onClick();
		}
	};

	return (
		<div
			className={style}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			aria-label={altText}
			tabIndex={0}
			role="button"
		>
			{label}
			{icon}
		</div>
	);
}

/**
 * Props for {@link MenuItem}
 */
export interface MenuItemProps {
	onClick: (event: unknown) => void;
	text: string;
	isActive: boolean;
	/**
	 * Icon to display next to the container name based on its state.
	 */
	stateIcon?: React.ReactElement;
	/**
	 * Callback function for deleting a closed container.
	 * Only shown when the container is closed.
	 */
	onDelete?: (event: React.MouseEvent) => void;
	/**
	 * Whether the container is closed and can be deleted.
	 */
	isClosed?: boolean;

	/**
	 * Whether the container or data object is blinking.
	 */
	blink?: boolean;
}

const useMenuItemStyles = makeStyles({
	root: {
		"alignItems": "center",
		"cursor": "pointer",
		"display": "flex",
		"flexDirection": "row",
		"paddingLeft": "15px",
		"&:hover": {
			color: tokens.colorNeutralForeground1Hover,
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
	active: {
		color: tokens.colorNeutralForeground1Selected,
		backgroundColor: tokens.colorNeutralBackground1Selected,
	},
	inactive: {
		color: tokens.colorNeutralForeground1,
		backgroundColor: tokens.colorNeutralBackground1,
	},
	connected: {
		"color": tokens.colorNeutralForeground1,
		"&:hover": {
			"color": tokens.colorNeutralForeground1Hover,
		},
	},
	itemContent: {
		display: "flex",
		alignItems: "center",
		flex: 1,
		gap: "8px",
	},
	blinkText: {
		"animationName": {
			"0%": { color: "inherit" },
			"50%": { color: "black" },
			"100%": { color: "inherit" },
		},
		"animationDuration": "0.2s",
		"animationTimingFunction": "ease-in-out",
		"animationIterationCount": "3",
		"animationFillMode": "forwards",
	},
	deleteButton: {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
		padding: "4px",
		marginLeft: "auto",
		"&:hover": {
			backgroundColor: tokens.colorNeutralBackground1Hover,
		},
	},
});

/**
 * Generic component for a menu item (under a section).
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	const {
		isActive,
		onClick,
		text,
		stateIcon,
		onDelete,
		isClosed = false,
		blink = false,
	} = props;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (event.key === "Enter" || event.key === " ") {
			onClick(event);
		}
	};

	const styles = useMenuItemStyles();

	// Base style (active state for selection)
	const baseStyle = isActive ? styles.active : styles.inactive;

	// Use connected style as default since we're replacing colors with icons
	const connectionStyle = styles.connected;

	const style = mergeClasses(styles.root, baseStyle, connectionStyle);

	return (
		<div
			role="button"
			className={style}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			tabIndex={0}
		>
			<div className={styles.itemContent}>
				<span className={mergeClasses(blink === true && styles.blinkText)}>{text}</span>
				{stateIcon}
			</div>
			{isClosed && onDelete && (
				<Tooltip content="Remove closed container" relationship="label">
					<Button
						icon={<Dismiss24Regular />}
						className={styles.deleteButton}
						onClick={(e) => {
							e.stopPropagation();
							onDelete(e);
						}}
						aria-label="Remove closed container"
					/>
				</Tooltip>
			)}
		</div>
	);
}

/**
 * {@link Menu} input props.
 */
export interface MenuProps {
	/**
	 * The current menu selection.
	 */
	currentSelection: MenuSelection;

	/**
	 * Sets the menu selection to the specified value.
	 */
	setSelection(newSelection: MenuSelection): void;

	/**
	 * Set of features supported by the {@link @fluidframework/devtools-core#IFluidDevtools}
	 * instance being used by the page application.
	 */
	supportedFeatures: DevtoolsFeatureFlags;

	/**
	 * The set of Containers to offer as selection options.
	 */
	containers?: ContainerKey[];

	/**
	 * The set of Data Objects to offer as selection options.
	 */
	dataObjects?: ContainerKey[];
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

	/**
	 * Label for the section (e.g., "Containers", "Data Objects").
	 */
	sectionLabel: string;

	/**
	 * Tooltip content to display for the section info icon.
	 */
	tooltipContent: React.ReactElement;
}

/**
 * Displays the Containers menu section, allowing the user to select the Container or Data Object to display.
 *
 * @remarks Displays a spinner while the Container or Data Object list is being loaded (if the list is undefined),
 * and displays a note when there are no registered Containers or Data Objects (if the list is empty).
 */
function ContainersMenuSection(props: ContainersMenuSectionProps): React.ReactElement {
	const {
		containers,
		selectContainer,
		currentContainerSelection,
		sectionLabel,
		tooltipContent,
	} = props;

	const messageRelay = useMessageRelay();
	const [containerStates, setContainerStates] = React.useState<
		Map<ContainerKey, ContainerStateMetadata>
	>(new Map());
	// Set of container keys that should blink
	const [blinkingContainers, setBlinkingContainers] = React.useState<Set<string>>(new Set());

	// Fetch container states when containers list changes
	React.useEffect(() => {
		if (containers === undefined) {
			return;
		}

		const inboundMessageHandlers: InboundHandlers = {
			[ContainerStateChange.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ContainerStateChange.Message;
				setContainerStates((prev) => {
					const newMap = new Map(prev);
					newMap.set(message.data.containerKey, message.data.containerState);
					return newMap;
				});
				return true;
			},
			[DataVisualization.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DataVisualization.Message;
				const containerKey = message.data.containerKey;

				// Only trigger blinking if this is an actual data change, not a user-requested visualization
				if (message.data.reason === DataVisualization.UpdateReason.DataChanged) {
					setBlinkingContainers((prev) => {
						const newSet = new Set(prev);
						newSet.add(containerKey);

						// Remove from blinking set after animation duration
						setTimeout(() => {
							setBlinkingContainers((current) => {
								const updatedSet = new Set(current);
								updatedSet.delete(containerKey);
								return updatedSet;
							});
						}, BLINK_ANIMATION_DURATION);

						return newSet;
					});
				}

				return true;
			},
		};
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: "ContainersMenuSection",
			});
		}
		messageRelay.on("message", messageHandler);
		for (const containerKey of containers) {
			messageRelay.postMessage(GetContainerState.createMessage({ containerKey }));
		}
		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containers, messageRelay]);

	/**
	 * Gets the appropriate icon for a container based on its state.
	 * Only shows icons for disconnected states. Closed containers show no icon.
	 */
	function getContainerStateIcon(containerKey: ContainerKey): React.ReactElement | undefined {
		const state = containerStates.get(containerKey);
		if (state === undefined) {
			return undefined; // No icon for unknown state
		}

		// Don't show icon for closed containers - they'll have the X button instead
		if (state.closed) {
			return undefined;
		}

		if (state.connectionState === ConnectionState.Disconnected) {
			return <PlugDisconnected20Regular />; // Only show icon for disconnected
		}

		return undefined; // No icon for connected states
	}

	/**
	 * Handles deletion of a closed container.
	 */
	function handleDeleteContainer(containerKey: ContainerKey): void {
		messageRelay.postMessage(RemoveContainer.createMessage(containerKey));
	}

	let containerSectionInnerView: React.ReactElement;
	if (containers === undefined) {
		containerSectionInnerView = <Waiting label={`Fetching ${sectionLabel} list`} />;
	} else if (containers.length === 0) {
		containerSectionInnerView = <div>{`No ${sectionLabel} found.`}</div>;
	} else {
		containers.sort((a: string, b: string) => a.localeCompare(b));
		containerSectionInnerView = (
			<>
				{containers.map((containerKey: string) => {
					const state = containerStates.get(containerKey);
					const isClosed = state?.closed ?? false;

					return (
						<MenuItem
							key={containerKey}
							isActive={currentContainerSelection === containerKey}
							text={containerKey}
							stateIcon={getContainerStateIcon(containerKey)}
							isClosed={isClosed}
							onDelete={isClosed ? () => handleDeleteContainer(containerKey) : undefined}
							onClick={(event): void => {
								selectContainer(`${containerKey}`);
							}}
							blink={blinkingContainers.has(containerKey)}
						/>
					);
				})}
			</>
		);
	}

	return (
		<MenuSection
			header={
				<MenuSectionLabelHeader
					label={sectionLabel}
					icon={[
						<InfoIcon key="info" content={tooltipContent} />,
						<RefreshButton key="refresh" label={sectionLabel} />,
					]}
				/>
			}
			key="container-selection-menu-section"
		>
			{containerSectionInnerView}
		</MenuSection>
	);
}

/**
 * Menu component for {@link DevtoolsView}.
 */
export function Menu(props: MenuProps): React.ReactElement {
	const { currentSelection, setSelection, supportedFeatures, containers, dataObjects } = props;
	const usageLogger = useLogger();

	const styles = useMenuStyles();

	function onContainerClicked(containerKey: ContainerKey): void {
		setSelection({ type: "containerMenuSelection", containerKey });
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: "Menu_Container" },
		});
	}

	function onTelemetryClicked(): void {
		setSelection({ type: "telemetryMenuSelection" });
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: "Menu_Telemetry" },
		});
	}

	function onSettingsClicked(): void {
		setSelection({ type: "settingsMenuSelection" });
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: "Menu_Settings" },
		});
	}

	function onHomeClicked(): void {
		setSelection({ type: "homeMenuSelection" });
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: "Menu_Home" },
		});
	}

	function onOpLatencyClicked(): void {
		setSelection({ type: "opLatencyMenuSelection" });
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: "Menu_OpLatency" },
		});
	}

	const menuSections: React.ReactElement[] = [];

	menuSections.push(
		<MenuSection
			header={
				<MenuSectionButtonHeader
					label="Home"
					altText="Home"
					onClick={onHomeClicked}
					isActive={currentSelection.type === "homeMenuSelection"}
				/>
			}
			key="home-menu-section"
		/>,
	);

	// Show Containers section if there are containers or if data objects feature is not enabled
	if (containers && containers.length > 0) {
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
				sectionLabel="Containers"
				tooltipContent={containersInfoTooltipText}
			/>,
		);
	}

	// Show Data Objects section if there are data objects
	if (dataObjects && dataObjects.length > 0) {
		menuSections.push(
			<ContainersMenuSection
				key="data-objects-menu-section"
				containers={dataObjects}
				currentContainerSelection={
					currentSelection?.type === "containerMenuSelection"
						? currentSelection.containerKey
						: undefined
				}
				selectContainer={onContainerClicked}
				sectionLabel="Data Objects"
				tooltipContent={dataObjectsInfoTooltipText}
			/>,
		);
	}

	// Display the Telemetry menu section only if the corresponding Devtools instance supports telemetry messaging.
	if (supportedFeatures.telemetry === true) {
		menuSections.push(
			<MenuSection
				header={<MenuSectionLabelHeader label="Telemetry" />}
				key="telemetry-menu-section"
			>
				<MenuItem
					isActive={currentSelection?.type === "telemetryMenuSelection"}
					text="Events"
					onClick={onTelemetryClicked}
				/>
			</MenuSection>,
		);
	}

	if (supportedFeatures.opLatencyTelemetry === true) {
		menuSections.push(
			<MenuSection
				header={
					<MenuSectionButtonHeader
						label="Op Latency"
						altText="Op Latency"
						onClick={onOpLatencyClicked}
						isActive={currentSelection?.type === "opLatencyMenuSelection"}
					/>
				}
				key="op-latency-menu-section"
			/>,
		);
	}

	menuSections.push(
		<MenuSection
			header={
				<MenuSectionButtonHeader
					label="Settings"
					altText="Settings"
					onClick={onSettingsClicked}
					isActive={currentSelection?.type === "settingsMenuSelection"}
				/>
			}
			key="settings-menu-section"
		/>,
	);

	return (
		<div className={styles.root}>{menuSections.length === 0 ? <Waiting /> : menuSections}</div>
	);
}
