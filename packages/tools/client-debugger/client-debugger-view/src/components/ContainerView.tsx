/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOverflowSetItemProps, IconButton, Link, OverflowSet, Stack } from "@fluentui/react";
import { HasContainerId } from "@fluid-tools/client-debugger";
import React from "react";

import { initializeFluentUiIcons } from "../InitializeIcons";
import { AudienceView } from "./AudienceView";
import { ContainerHistoryView } from "./ContainerHistoryView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes
// - Move Container action bar (connection / disposal buttons) to summary header, rather than in
//   the Container data view.

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

/**
 * `className` used by {@link ContainerView}.
 *
 * @internal
 */
const containerViewClassName = `fluid-client-debugger-view`;

/**
 * {@link ContainerView} input props.
 *
 * @internal
 */
export type ContainerViewProps = HasContainerId;

/**
 * Displays information about the provided container and its audience.
 *
 * @internal
 */
export function ContainerView(props: ContainerViewProps): React.ReactElement {
	const { containerId } = props;

	// Inner view selection
	const [innerViewSelection, setInnerViewSelection] = React.useState<PanelView>(
		PanelView.ContainerData,
	);
	let innerView: React.ReactElement;
	switch (innerViewSelection) {
		case PanelView.ContainerData:
			innerView = <DataObjectsView containerId={containerId} />;
			break;
		case PanelView.Audience:
			innerView = <AudienceView containerId={containerId} />;
			break;
		case PanelView.ContainerStateHistory:
			innerView = <ContainerHistoryView containerId={containerId} />;
			break;
		default:
			throw new Error(`Unrecognized PanelView selection value: "${innerViewSelection}".`);
	}
	const view = (
		<Stack tokens={{ childrenGap: 10 }}>
			<PanelViewSelectionMenu
				currentSelection={innerViewSelection}
				updateSelection={setInnerViewSelection}
			/>
			{innerView}
		</Stack>
	);

	return (
		<Stack
			tokens={{
				// Add some spacing between the menu and the inner view
				childrenGap: 25,
			}}
			styles={{
				root: {
					height: "100%",
				},
			}}
			className={containerViewClassName}
		>
			<ContainerSummaryView containerId={containerId} />
			<div style={{ width: "100%", height: "100%", overflowY: "auto" }}>{view}</div>
		</Stack>
	);
}

/**
 * Inner view options within the container view.
 *
 * @internal
 */
export enum PanelView {
	/**
	 * Display view of Container data.
	 */
	ContainerData = "Data",

	/**
	 * Display view of Audience participants / history.
	 */
	Audience = "Audience",

	/**
	 * Display view of Container state history.
	 */
	ContainerStateHistory = "States",

	// TODOs:
	// - Network stats
	// - Ops/message latency stats
}

/**
 * {@link PanelViewSelectionMenu} input props.
 *
 * @internal
 */
export interface PanelViewSelectionMenuProps {
	/**
	 * The currently selected inner view.
	 */
	currentSelection: PanelView;

	/**
	 * Updates the inner view to the one specified.
	 */
	updateSelection(newSelection: PanelView): void;
}

/**
 * Menu for selecting the inner view to be displayed within the view for the currently selected container.
 *
 * @internal
 */
export function PanelViewSelectionMenu(props: PanelViewSelectionMenuProps): React.ReactElement {
	const { currentSelection, updateSelection } = props;

	const options: IOverflowSetItemProps[] = Object.entries(PanelView).map(([_, flag]) => ({
		key: flag,
	}));

	/**
	 * Specifies how to render an individual menu option.
	 */
	function onRenderItem(item: IOverflowSetItemProps): React.ReactElement {
		return (
			<Link
				aria-label={item.key}
				styles={{ root: { marginRight: 10 } }}
				disabled={item.key === currentSelection}
				onClick={(): void => updateSelection(item.key as PanelView)}
			>
				{item.key}
			</Link>
		);
	}

	/**
	 * Specifies how to render any overflow options in the menu.
	 */
	function onRenderOverflowButton(
		overflowItems: IOverflowSetItemProps[] | undefined,
	): React.ReactElement {
		return overflowItems === undefined ? (
			<></>
		) : (
			<IconButton
				title="More options"
				menuIconProps={{ iconName: "More" }}
				menuProps={{ items: overflowItems }}
			/>
		);
	}

	return (
		<OverflowSet
			aria-label="Container sub-view selection"
			items={options}
			// TODO: We can add additional menu options here. Reserved for less-frequently used views items.
			// overflowItems={}
			onRenderItem={onRenderItem}
			onRenderOverflowButton={onRenderOverflowButton}
		/>
	);
}
