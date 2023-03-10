/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	DefaultPalette,
	IStackItemStyles,
	IStackStyles,
	IStackTokens,
	Stack,
	StackItem,
} from "@fluentui/react";
import { ContainerMetadata } from "@fluid-tools/client-debugger";
import React from "react";

import { initializeFluentUiIcons } from "../InitializeIcons";
// import { AudienceView } from "./AudienceView";
import { TelemetryView } from "./TelemetryView";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes
// - Move Container action bar (connection / disposal buttons) to summary header, rather than in
//   the Container data view.

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

/**
 * `className` used by {@link MainView}.
 *
 * @internal
 */
export const clientDebugViewClassName = `fluid-client-debugger-view`;

/**
 * Container for all the views in the fluid debugger.
 *
 * @internal
 */
export function MainView(): React.ReactElement {
	const [clickedOption, setClickedOption] = React.useState<string>("");
	const [rightView, setRightView] = React.useState<React.ReactElement>();

	const onTelemetryClicked = (): void => {
		setClickedOption("telemetry");
	};

	const onAudienceClicked = (): void => {
		setClickedOption("audience");
	};

	const onContainerClicked = (containerId: string): void => {
		setClickedOption(containerId);
	};

	React.useEffect(() => {
		if (clickedOption === "telemetry") {
			setRightView(<TelemetryView />);
		} else if (clickedOption === "audience") {
			setRightView(<div>Audience view goes here</div>);
		} else if (clickedOption.startsWith("container:")) {
			setRightView(<div>View for container {clickedOption}</div>);
		}
	}, [clickedOption, setClickedOption]);
	// Styles definition
	const stackStyles: IStackStyles = {
		root: {
			background: DefaultPalette.themeTertiary,
			height: 500,
		},
	};
	const contentViewStyles: IStackItemStyles = {
		root: {
			alignItems: "center",
			background: DefaultPalette.themeLight,
			color: DefaultPalette.white,
			display: "flex",
			justifyContent: "center",
		},
	};

	const menuStyles: IStackItemStyles = {
		root: { ...contentViewStyles, "display": "flex", "flex-direction": "column" },
	};

	// Tokens definition
	const stackTokens: IStackTokens = {
		childrenGap: 5,
		padding: 10,
	};

	const menuSectionStyles: IStackStyles = {
		root: {
			background: DefaultPalette.themeLight,
			border: `1px 1px 0px 1px solid ${DefaultPalette.themePrimary}`,
			padding: "3px",
		},
	};
	const menuSectionHeaderStyles: IStackStyles = {
		root: {
			border: `1px solid ${DefaultPalette.themePrimary}`,
			background: DefaultPalette.themeLighterAlt,
			fontWeight: "bold",
			paddingLeft: "2px",
		},
	};
	const menuSectionItemStyles: IStackStyles = {
		root: {
			paddingLeft: "20px",
			cursor: "pointer",
		},
	};

	return (
		<Stack enableScopedSelectors horizontal styles={stackStyles} tokens={stackTokens}>
			<Stack.Item grow={1} styles={menuStyles}>
				<Stack styles={menuSectionStyles}>
					<Stack.Item styles={menuSectionHeaderStyles}>Containers</Stack.Item>
					<ContainersList
						options={[
							{ id: "1", nickname: "Container 1" },
							{ id: "2", nickname: "Container 2" },
						]}
						onClickHandler={onContainerClicked}
						styles={menuSectionItemStyles}
					/>
				</Stack>
				<Stack styles={menuSectionStyles}>
					<Stack.Item styles={menuSectionHeaderStyles}>Audience</Stack.Item>
					<Stack.Item styles={menuSectionItemStyles} onClick={onAudienceClicked}>
						See Audience
					</Stack.Item>
				</Stack>
				<Stack styles={menuSectionStyles}>
					<Stack.Item styles={menuSectionHeaderStyles}>Telemetry</Stack.Item>
					<Stack.Item styles={menuSectionItemStyles} onClick={onTelemetryClicked}>
						See Telemetry
					</Stack.Item>
				</Stack>
			</Stack.Item>
			<Stack.Item grow={5} styles={contentViewStyles}>
				<div style={{ width: "100%", height: "100%", overflowY: "auto" }}>{rightView}</div>
			</Stack.Item>
		</Stack>
	);
}

/**
 * {@link ContainersList} input props.
 *
 * @internal
 */
interface ContainersListProps {
	/**
	 * Full list of drop-down options.
	 */
	options: ContainerMetadata[];

	/**
	 * Called when the an option is clicked.
	 * @param containerId - The Container ID of the container that was clicked.
	 */
	onClickHandler(containerId: string): void;

	/**
	 * Styles for each item
	 */
	styles: IStackItemStyles;
}

/**
 * A list of Fluid Containers to display in the menu.
 *
 * @internal
 */
function ContainersList(props: ContainersListProps): React.ReactElement {
	const { options, onClickHandler, styles } = props;

	return (
		<>
			{options.map((o) => (
				<StackItem
					key={o.id}
					onClick={(event): void => {
						onClickHandler(`container:${o.id}`);
					}}
					styles={styles}
				>
					{o.nickname ?? o.id}
				</StackItem>
			))}
		</>
	);
}
