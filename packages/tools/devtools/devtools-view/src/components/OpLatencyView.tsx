/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Body1,
	Body1Strong,
	Button,
	Link,
	Subtitle1,
	makeStyles,
} from "@fluentui/react-components";
import {
	DevtoolsFeatures,
	GetDevtoolsFeatures,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	SetUnsampledTelemetry,
	TelemetryEvent,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../MessageRelayContext.js";

import { DynamicComposedChart, type GraphDataSet } from "./graphs/index.js";

const useStyles = makeStyles({
	flexColumn: {
		display: "flex",
		flexDirection: "column",
	},
	flexRow: {
		display: "flex",
		flexDirection: "row",
	},
	/**
	 * Main container housing all the child components
	 */
	mainContainer: {
		width: "100%",
		height: "300px",
	},
	/**
	 * Where the graph is described
	 */
	graphAboutContainer: {
		marginTop: "15px",
	},
	/**
	 * Where the op lifecycle phases are described
	 */
	opPhasesSection: {
		marginTop: "15px",
	},
});

/**
 * Page that shows op latency metrics.
 * @remarks TODO: Once Op Latency data is available from {@link messageRelay}, the op latency data should be passed into the graph instead of this test data set.
 */
export function OpLatencyView(): React.ReactElement {
	const styles = useStyles();

	const messageRelay = useMessageRelay();
	const [durationOutboundBatchingData, setDurationOutboundBatchingData] =
		React.useState<GraphDataSet>({
			graphType: "line",
			schema: {
				displayName: "Duration Outbound",
				uuid: "durationOutbound",
				xAxisDataKey: "timestamp",
				yAxisDataKey: "duration",
			},
			data: [],
		});
	const [durationNetworkData, setDurationNetworkData] = React.useState<GraphDataSet>({
		graphType: "line",
		schema: {
			displayName: "Duration Network",
			uuid: "durationNetwork",
			xAxisDataKey: "timestamp",
			yAxisDataKey: "duration",
		},
		data: [],
	});
	const [durationInboundToProcessingData, setDurationInboundToProcessingData] =
		React.useState<GraphDataSet>({
			graphType: "line",
			schema: {
				displayName: "Duration Inbound",
				uuid: "durationInbound",
				xAxisDataKey: "timestamp",
				yAxisDataKey: "duration",
			},
			data: [],
		});
	const [unsampledTelemetry, setUnsampledTelemetry] = React.useState<boolean>(false);

	React.useEffect(() => {
		// Handler for incoming messages
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DevtoolsFeatures.Message;
				const messageFlag = message.data.unsampledTelemetry;
				if (messageFlag !== undefined) {
					setUnsampledTelemetry(messageFlag);
					return true;
				}
				return false;
			},
		};

		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers);
		}

		messageRelay.on("message", messageHandler);
		messageRelay.postMessage(GetDevtoolsFeatures.createMessage());

		// Cleanup the event listener
		return () => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay]);

	// Render the text conditionally
	const renderInstructions = unsampledTelemetry !== true;

	function formatTimestamp(timestamp: number): string {
		return new Date(timestamp).toTimeString().slice(0, 8);
	}

	const toggleUnsampledTelemetry = (): void => {
		const newValue = !unsampledTelemetry;
		const toggleMessage = SetUnsampledTelemetry.createMessage({
			unsampledTelemetry: newValue,
		});
		messageRelay.postMessage(toggleMessage);
	};

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[TelemetryEvent.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as TelemetryEvent.Message;
				const eventContents = message.data.event.logContent;
				// Op roundtrip time logs are the only ones with relevant information for this component
				if (!eventContents.eventName.endsWith("OpRoundtripTime")) {
					return false;
				}

				setDurationOutboundBatchingData((currentData) => {
					const newDataPoint = {
						timestamp: formatTimestamp(message.data.event.timestamp),
						duration: Number(eventContents.durationOutboundBatching),
					};
					return {
						...currentData,
						data: [...(currentData?.data ?? []), newDataPoint],
					};
				});
				setDurationNetworkData((currentData) => {
					const newDataPoint = {
						timestamp: formatTimestamp(message.data.event.timestamp),
						duration: Number(eventContents.durationNetwork),
					};
					return {
						...currentData,
						data: [...(currentData?.data ?? []), newDataPoint],
					};
				});
				setDurationInboundToProcessingData((currentData) => {
					const newDataPoint = {
						timestamp: formatTimestamp(message.data.event.timestamp),
						duration: Number(eventContents.durationInboundToProcessing),
					};
					return {
						...currentData,
						data: [...(currentData?.data ?? []), newDataPoint],
					};
				});

				return true;
			},
		};

		// Event handler for messages coming from the Message Relay
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers);
		}

		messageRelay.on("message", messageHandler);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay]);

	return (
		<div className={styles.mainContainer} data-testid="test-op-latency-view">
			<h3>Op Latency</h3>
			{renderInstructions ? (
				<Body1>
					{`Unsampled telemetry is not currently enabled in the Fluid-based application and is necessary for this feature to work as designed.`}
					{`\nIMPORTANT: This flag is only intended for local development with Devtools and should not be enabled in production scenarios.`}
				</Body1>
			) : (
				<>
					<DynamicComposedChart
						margin={{
							top: 15,
							right: 30,
							left: 5,
							bottom: 40,
						}}
						legendStyle={{
							marginLeft: 25,
							bottom: -5,
						}}
						yAxisUnitDisplayName="ms"
						dataSets={[
							durationOutboundBatchingData,
							durationNetworkData,
							durationInboundToProcessingData,
						]}
					/>
					<div className={styles.graphAboutContainer}>
						<div className={styles.flexColumn}>
							<Subtitle1>About</Subtitle1>
							<Body1>
								{`This Graph shows Fluid Op (Operation) Latency metrics.
					As you make changes in your Fluid-based application, you'll see this graph update in real time with latency data for any ops your client produces.`}
								&nbsp;
								<Link
									aria-label="Fluid Framework Ops Documentation"
									target="_blank"
									rel="noreferrer"
									href="https://fluidframework.com/docs/concepts/tob/"
								>
									{`Learn more about ops.`}
								</Link>
							</Body1>
						</div>

						<div className={styles.opPhasesSection}>
							<Body1Strong>{`Ops in Fluid go through four steps:`}</Body1Strong>
							<ol>
								<li>
									<Body1>Op is submitted by the application.</Body1>
								</li>
								<li>
									<Body1>
										Op is sent to service. Note: we do not know for sure when the op is
										actually sent on the network, we only track when it is added to a local
										outbound queue.
									</Body1>
								</li>
								<li>
									<Body1>(Sequenced) Op is received from service.</Body1>
								</li>
								<li>
									<Body1>(Sequenced) Op is processed and passed to the application.</Body1>
								</li>
							</ol>
						</div>
						<Body1Strong>
							With the above four phases in mind, these are the definitions for the metrics in
							the graph above:
						</Body1Strong>
						<ol>
							<li>
								<div className={styles.flexRow}>
									<Body1Strong>{`Duration Outbound:`}&nbsp;</Body1Strong>
									<Body1>{`Time in milliseconds between (1) and (2); The time between an op being submitted by the application and it being put in the outbound queue to be sent to the ordering service.`}</Body1>
								</div>
							</li>
							<li>
								<div className={styles.flexRow}>
									<Body1Strong>{`Duration Network:`}&nbsp;</Body1Strong>
									<Body1>{`Time between (2) and (3); how long in milliseconds it took for the op to be sequenced by the service, sent back, and received by the Fluid client.`}</Body1>
								</div>
							</li>
							<li>
								<div className={styles.flexRow}>
									<Body1Strong>{`Duration Inbound:`}&nbsp;</Body1Strong>
									<Body1>{`Time between (3) and (4); how long in milliseconds it took to do framework-related processing on a received op before letting the application react to it`}</Body1>
								</div>
							</li>
						</ol>
					</div>
				</>
			)}
			<Button size="small" onClick={toggleUnsampledTelemetry}>
				{unsampledTelemetry ? "Disable Unsampled Telemetry" : "Enable Unsampled Telemetry"}
			</Button>
			<Body1>The page will refresh upon clicking the button</Body1>
		</div>
	);
}
