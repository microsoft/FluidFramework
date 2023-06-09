/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import {
	Tab,
	TabList,
	TabValue,
	SelectTabData,
	SelectTabEvent,
	Divider,
} from "@fluentui/react-components";
import {
	ContainerDevtoolsFeature,
	ContainerDevtoolsFeatureFlags,
	ContainerDevtoolsFeatures,
	GetContainerDevtoolsFeatures,
	HasContainerKey,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	handleIncomingMessage,
} from "@fluid-experimental/devtools-core";
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
export type ContainerDevtoolsViewProps = HasContainerKey;

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
 * Container Devtools view.
 * Communicates with {@link @fluid-experimental/devtools-core#ContainerDevtools} via {@link MessageRelayContext} to get
 * Container-level stats to display, including Container states and history, Audience state and history, and Container
 * data.
 */
export function ContainerDevtoolsView(props: ContainerDevtoolsViewProps): React.ReactElement {
	const { containerKey } = props;

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
			[ContainerDevtoolsFeatures.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ContainerDevtoolsFeatures.Message;
				if (message.data.containerKey === containerKey) {
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
		messageRelay.postMessage(GetContainerDevtoolsFeatures.createMessage({ containerKey }));

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [containerKey, messageRelay, setSupportedFeatures]);

	return supportedFeatures === undefined ? (
		<Waiting />
	) : (
		<_ContainerDevtoolsView containerKey={containerKey} supportedFeatures={supportedFeatures} />
	);
}

/**
 * {@link _ContainerDevtoolsView} input props.
 */
interface _ContainerDevtoolsViewProps extends HasContainerKey {
	/**
	 * Set of features supported by the corresponding Container-level devtools instance.
	 */
	supportedFeatures: ContainerDevtoolsFeatureFlags;
}

/**
 * Internal {@link ContainerDevtoolsView}, displayed after supported feature set has been acquired from the webpage.
 */
function _ContainerDevtoolsView(props: _ContainerDevtoolsViewProps): React.ReactElement {
	const { containerKey, supportedFeatures } = props;
	const panelViews = Object.values(PanelView);
	// Inner view selection
	const [innerViewSelection, setInnerViewSelection] = React.useState<TabValue>(
		supportedFeatures[ContainerDevtoolsFeature.ContainerData] === true
			? PanelView.ContainerData
			: PanelView.ContainerStateHistory,
	);

	let innerView: React.ReactElement;
	switch (innerViewSelection) {
		case PanelView.ContainerData:
			innerView = <DataObjectsView containerKey={containerKey} />;
			break;
		case PanelView.Audience:
			innerView = <AudienceView containerKey={containerKey} />;
			break;
		case PanelView.ContainerStateHistory:
			innerView = <ContainerHistoryView containerKey={containerKey} />;
			break;
		default:
			throw new Error(`Unrecognized PanelView selection value: "${innerViewSelection}".`);
	}

	const onTabSelect = (event: SelectTabEvent, data: SelectTabData): void => {
		setInnerViewSelection(data.value);
	};

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
				<ContainerSummaryView containerKey={containerKey} />
			</Stack.Item>
			<Divider appearance="strong" />
			<Stack.Item style={{ width: "100%", height: "100%", overflowY: "auto" }}>
				<Stack tokens={{ childrenGap: 10 }}>
					<TabList selectedValue={innerViewSelection} onTabSelect={onTabSelect}>
						{panelViews.map((view: string) => {
							return (
								<Tab key={view} value={view}>
									{view}
								</Tab>
							);
						})}
					</TabList>
					{innerView}
				</Stack>
			</Stack.Item>
		</Stack>
	);
}
