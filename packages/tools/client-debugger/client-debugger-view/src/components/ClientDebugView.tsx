/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	IOverflowSetItemProps,
	IconButton,
	Link,
	OverflowSet,
	Stack,
	initializeIcons,
} from "@fluentui/react";
import React from "react";

import { HasClientDebugger } from "../CommonProps";
import { RenderOptions, getRenderOptionsWithDefaults } from "../RendererOptions";
import { AudienceView } from "./AudienceView";
import { ContainerDataView } from "./ContainerDataView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes
// - Move Container action bar (connection / disposal buttons) to summary header, rather than in
//   the Container data view.

// Initialize Fluent icons used this library's components.
initializeIcons();

/**
 * `className` used by {@link ClientDebugView}.
 *
 * @internal
 */
export const clientDebugViewClassName = `fluid-client-debugger-view`;

/**
 * {@link ClientDebugView} input props.
 *
 * @internal
 */
export interface ClientDebugViewProps extends HasClientDebugger {
	/**
	 * Rendering policies for different kinds of Fluid client and object data.
	 *
	 * @defaultValue Strictly use default visualization policies.
	 *
	 * @privateRemarks TODO: get render options from debugger object.
	 */
	renderOptions?: RenderOptions;
}

/**
 * Displays information about the provided container and its audience.
 *
 * @internal
 */
export function ClientDebugView(props: ClientDebugViewProps): React.ReactElement {
	const { clientDebugger, renderOptions: userRenderOptions } = props;
	const { container } = clientDebugger;

	const renderOptions: Required<RenderOptions> = getRenderOptionsWithDefaults(userRenderOptions);

	const [isContainerClosed, setIsContainerClosed] = React.useState<boolean>(container.closed);

	React.useEffect(() => {
		function onContainerClose(): void {
			setIsContainerClosed(true);
		}

		container.on("closed", onContainerClose);

		setIsContainerClosed(container.closed);

		return (): void => {
			container.off("closed", onContainerClose);
		};
	}, [clientDebugger, container, setIsContainerClosed]);

	// UI state
	const [rootViewSelection, updateRootViewSelection] = React.useState<RootView>(
		RootView.Container,
	);

	let view: React.ReactElement;
	if (isContainerClosed) {
		view = <div>The Container has been disposed.</div>;
	} else {
		let innerView: React.ReactElement;
		switch (rootViewSelection) {
			case RootView.Container:
				innerView = <ContainerDataView clientDebugger={clientDebugger} />;
				break;
			case RootView.Data:
				innerView = (
					<DataObjectsView
						clientDebugger={clientDebugger}
						renderOptions={renderOptions.sharedObjectRenderOptions}
					/>
				);
				break;
			case RootView.Audience:
				innerView = (
					<AudienceView
						clientDebugger={clientDebugger}
						onRenderAudienceMember={renderOptions.onRenderAudienceMember}
					/>
				);
				break;
			default:
				throw new Error(`Unrecognized RootView selection value: "${rootViewSelection}".`);
		}
		view = (
			<Stack tokens={{ childrenGap: 10 }}>
				<ViewSelectionMenu
					currentSelection={rootViewSelection}
					updateSelection={updateRootViewSelection}
				/>
				{innerView}
			</Stack>
		);
	}

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
			className={clientDebugViewClassName}
		>
			<ContainerSummaryView clientDebugger={clientDebugger} />
			<div style={{ width: "100%", height: "100%", overflowY: "auto" }}>{view}</div>
		</Stack>
	);
}

/**
 * Root view options for the container visualizer.
 */
enum RootView {
	/**
	 * Corresponds with {@link ContainerDataView}.
	 */
	Container = "Container",

	/**
	 * Corresponds with {@link DataObjectsView}.
	 */
	Data = "Data",

	/**
	 * Corresponds with {@link AudienceView}.
	 */
	Audience = "Audience",
}

/**
 * {@link ViewSelectionMenu} input props.
 */
interface ViewSelectionMenuProps {
	/**
	 * The currently-selected inner app view.
	 */
	currentSelection: RootView;

	/**
	 * Updates the inner app view to the one specified.
	 */
	updateSelection(newSelection: RootView): void;
}

/**
 * Menu for selecting the inner app view to be displayed.
 */
function ViewSelectionMenu(props: ViewSelectionMenuProps): React.ReactElement {
	const { currentSelection, updateSelection } = props;

	const options: IOverflowSetItemProps[] = Object.entries(RootView).map(([_, flag]) => ({
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
				onClick={(): void => updateSelection(item.key as RootView)}
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
			aria-label="Debug root view selection"
			items={options}
			// TODO: We can add additional menu options here. Reserved for less-frequently used views items.
			// overflowItems={}
			onRenderItem={onRenderItem}
			onRenderOverflowButton={onRenderOverflowButton}
		/>
	);
}
