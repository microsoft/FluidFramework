/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IOverflowSetItemProps, IconButton, Link, OverflowSet, Stack } from "@fluentui/react";
import {
	ContainerDevtoolsFeature,
	ContainerDevtoolsFeatureFlags,
	ContainerDevtoolsFeatures,
	GetContainerDevtoolsFeatures,
	HasContainerId,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	handleIncomingMessage,
} from "@fluid-tools/client-debugger";
import React from "react";

import { initializeFluentUiIcons } from "../InitializeIcons";
import { useMessageRelay } from "../MessageRelayContext";
import { AudienceView } from "./AudienceView";
import { ContainerHistoryView } from "./ContainerHistoryView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";
import { Waiting } from "./Waiting";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes

// Ensure FluentUI icons are initialized for use below.
initializeFluentUiIcons();

const loggingContext = "INLINE(ContainerView)";

/**
 * `className` used by {@link ContainerDevtoolsView}.
 */
const containerDevtoolsViewClassName = `fluid-client-debugger-view`;

/**
 * {@link ContainerDevtoolsView} input props.
 */
export type ContainerDevtoolsViewProps = HasContainerId;

/**
 * Container Devtools view.
 * Communicates with {@link @fluid-tools/client-debugger#ContainerDevtools} via {@link MessageRelayContext} to get
 * Container-level stats to display, including Container states and history, Audience state and history, and Container
 * data.
 */
export function ContainerDevtoolsView(props: ContainerDevtoolsViewProps): React.ReactElement {
	const { containerId } = props;

	// Set of features supported by the corresponding Container-level devtools instance.
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		ContainerDevtoolsFeatureFlags | undefined
	>();

	const messageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerDevtoolsFeatures.MessageType]: (untypedMessage) => {
				const message = untypedMessage as ContainerDevtoolsFeatures.Message;
				if (message.data.containerId === containerId) {
					setSupportedFeatures(message.data.features);
					return true;
				}
				return false;
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
		messageRelay.postMessage(GetContainerDevtoolsFeatures.createMessage({ containerId }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerId, messageRelay, setSupportedFeatures]);

	return supportedFeatures === undefined ? (
		<Waiting />
	) : (
		<_ContainerDevtoolsView containerId={containerId} supportedFeatures={supportedFeatures} />
	);
}

/**
 * {@link _ContainerDevtoolsView} input props.
 */
interface _ContainerDevtoolsViewProps extends HasContainerId {
	/**
	 * Set of features supported by the corresponding Container-level devtools instance.
	 */
	supportedFeatures: ContainerDevtoolsFeatureFlags;
}

/**
 * Internal {@link ContainerDevtoolsView}, displayed after supported feature set has been acquired from the webpage.
 */
function _ContainerDevtoolsView(props: _ContainerDevtoolsViewProps): React.ReactElement {
	const { containerId, supportedFeatures } = props;

	// Inner view selection
	const [innerViewSelection, setInnerViewSelection] = React.useState<PanelView>(
		supportedFeatures[ContainerDevtoolsFeature.ContainerData] === true
			? PanelView.ContainerData
			: PanelView.ContainerStateHistory,
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
			className={containerDevtoolsViewClassName}
		>
			<Stack.Item>
				<ContainerSummaryView containerId={containerId} />
			</Stack.Item>
			<Stack.Item style={{ width: "100%", height: "100%", overflowY: "auto" }}>
				<Stack tokens={{ childrenGap: 10 }}>
					<PanelViewSelectionMenu
						currentSelection={innerViewSelection}
						updateSelection={setInnerViewSelection}
					/>
					{innerView}
				</Stack>
			</Stack.Item>
		</Stack>
	);
}

/**
 * Inner view options within the container view.
 */
enum PanelView {
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
 */
interface PanelViewSelectionMenuProps {
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
 */
function PanelViewSelectionMenu(props: PanelViewSelectionMenuProps): React.ReactElement {
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
