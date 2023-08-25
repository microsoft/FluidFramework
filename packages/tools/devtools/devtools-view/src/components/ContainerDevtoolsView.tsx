/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Divider,
	makeStyles,
	SelectTabData,
	SelectTabEvent,
	shorthands,
	Tab,
	TabList,
	TabValue,
} from "@fluentui/react-components";
import {
	ContainerDevtoolsFeatureFlags,
	ContainerDevtoolsFeatures,
	GetContainerDevtoolsFeatures,
	HasContainerKey,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	handleIncomingMessage,
} from "@fluid-experimental/devtools-core";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext";
import { ContainerFeatureFlagContext } from "../ContainerFeatureFlagHelper";
import { useLogger } from "../TelemetryUtils";
import { AudienceView } from "./AudienceView";
import { ContainerHistoryView } from "./ContainerHistoryView";
import { ContainerSummaryView } from "./ContainerSummaryView";
import { DataObjectsView } from "./DataObjectsView";
import { Waiting } from "./Waiting";

// TODOs:
// - Allow consumers to specify additional tabs / views for list of inner app view options.
// - History of client ID changes

const loggingContext = "INLINE(ContainerView)";

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

const useStyles = makeStyles({
	root: {
		...shorthands.gap("15px"),
		display: "flex",
		flexDirection: "column",
	},
});

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

	const styles = useStyles();
	const usageLogger = useLogger();
	const panelViews = Object.values(PanelView);
	// Inner view selection
	const [innerViewSelection, setInnerViewSelection] = React.useState<TabValue>(
		supportedFeatures.containerDataVisualization === true ||
			// Backwards compatibility check, needed until we require at least devtools-core/devtools v2.0.0-internal.6.1.0
			supportedFeatures["container-data"] === true
			? PanelView.ContainerData
			: PanelView.ContainerStateHistory,
	);

	let innerView: React.ReactElement;
	switch (innerViewSelection) {
		case PanelView.ContainerData:
			innerView = (
				<ContainerFeatureFlagContext.Provider
					value={{ containerFeatureFlags: supportedFeatures }}
				>
					<DataObjectsView containerKey={containerKey} />
				</ContainerFeatureFlagContext.Provider>
			);
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
		usageLogger?.sendTelemetryEvent({
			eventName: "Navigation",
			details: { target: `Container_${data.value}Tab` },
		});
	};

	return (
		<div className={styles.root}>
			<ContainerSummaryView containerKey={containerKey} />
			<Divider appearance="strong" />
			<div>
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
			</div>
		</div>
	);
}
