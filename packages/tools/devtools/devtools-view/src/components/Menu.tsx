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
import { ArrowSync24Regular } from "@fluentui/react-icons";
import type {
	HasContainerKey,
	DevtoolsFeatureFlags,
	ContainerKey,
} from "@fluidframework/devtools-core/internal";
import { GetContainerList } from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";
import { useLogger } from "../TelemetryUtils.js";

import { Waiting } from "./index.js";

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
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage = GetContainerList.createMessage();

/**
 * A refresh button to retrieve the latest list of containers.
 */
function RefreshButton(): React.ReactElement {
	const messageRelay = useMessageRelay();
	const usageLogger = useLogger();

	const transparentButtonStyle = {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
	};

	function handleRefreshClick(): void {
		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);
		usageLogger?.sendTelemetryEvent({ eventName: "ContainerRefreshButtonClicked" });
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
	 * The icon to display in the header of the menu section.
	 */
	icon?: React.ReactElement;
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
			{icon}
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
});

/**
 * Generic component for a menu item (under a section).
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	const { isActive, onClick, text } = props;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (event.key === "Enter" || event.key === " ") {
			onClick(event);
		}
	};

	const styles = useMenuItemStyles();
	const style = mergeClasses(styles.root, isActive ? styles.active : styles.inactive);

	return (
		<div
			role="button"
			className={style}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			tabIndex={0}
		>
			{text}
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
			header={<MenuSectionLabelHeader label="Containers" icon={<RefreshButton />} />}
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
	const { currentSelection, setSelection, supportedFeatures, containers } = props;
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
