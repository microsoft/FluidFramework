/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// import {
// 	Dropdown,
// 	IDropdownOption,
// 	IDropdownStyles,
// 	IStackTokens,
// 	Stack,
// 	StackItem,
// } from "@fluentui/react";
// import {
// 	tokens,
// 	ToggleButton,
// 	DataGridBody,
// 	DataGridRow,
// 	DataGrid,
// 	DataGridHeader,
// 	DataGridHeaderCell,
// 	DataGridCell,
// 	TableColumnDefinition,
// 	createTableColumn,
// } from "@fluentui/react-components";
// import { Info24Regular, Info24Filled } from "@fluentui/react-icons";
import { tokens } from "@fluentui/react-components";
import React from "react";
import { MultiStackedBarChart, IChartProps, IChartDataPoint } from "@fluentui/react-charting";

import {
	handleIncomingMessage,
	InboundHandlers,
	ISourcedDevtoolsMessage,
	TelemetryEvent,
} from "@fluid-tools/client-debugger";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";

/**
 * Displays op latency statistics and information.
 */
export function OpLatencyView(): React.ReactElement {
	const messageRelay = useMessageRelay();
	const [perfDataPoints, setperfDataPoints] = React.useState<IChartDataPoint[][] | undefined>();
	React.useEffect(() => {
		/**
		 * Handlers for inbound messages.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[TelemetryEvent.MessageType]: (untypedMessage) => {
				const message = untypedMessage as TelemetryEvent.Message;
				if (!message.data.event.logContent.eventName.endsWith("OpRoundtripTime")) {
					return true;
				}

				setperfDataPoints((currentDataPoints) => [
					...(currentDataPoints ?? []),
					[
						{
							legend: "durationOutboundBatching",
							data: message.data.event.logContent.durationOutboundBatching,
							color: tokens.colorBrandForeground1,
						},
						{
							legend: "durationNetwork",
							data: message.data.event.logContent.durationNetwork,
							color: tokens.colorBrandForeground2,
						},
						{
							legend: "durationInboundToProcessing",
							data: message.data.event.logContent.durationInboundToProcessing,
							color: tokens.colorBrandForegroundInverted,
						},
					] as IChartDataPoint[],
				]);
				return true;
			},
			// [TelemetryHistory.MessageType]: (untypedMessage) => {
			// 	const message = untypedMessage as TelemetryHistory.Message;
			// 	setTelemetryEvents(message.data.contents);
			// 	return true;
			// },
		};

		// Event handler for messages coming from the Message Relay
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers);
		}

		messageRelay.on("message", messageHandler);

		// // Request all log history
		// messageRelay.postMessage(GetTelemetryHistory.createMessage());

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setperfDataPoints]);

	/**
	 * Interface for op latency statistics.
	 * For details of what each field measures refer to {@link @fluidframework/container-runtime#IOpPerfTelemetryProperties}.
	 */
	// const points1: IChartDataPoint[] = [
	// 	{ legend: "durationOutboundBatching", data: 1, color: tokens.colorBrandForeground1 },
	// 	{ legend: "durationNetwork", data: 1, color: tokens.colorBrandForeground2 },
	// 	{
	// 		legend: "durationInboundToProcessing",
	// 		data: 1,
	// 		color: tokens.colorBrandForegroundInverted,
	// 	},
	// ];
	// const points2: IChartDataPoint[] = [
	// 	{ legend: "durationOutboundBatching", data: 1, color: tokens.colorBrandForeground1 },
	// 	{ legend: "durationNetwork", data: 2, color: tokens.colorBrandForeground2 },
	// 	{
	// 		legend: "durationInboundToProcessing",
	// 		data: 1,
	// 		color: tokens.colorBrandForegroundInverted,
	// 	},
	// ];
	// const points3: IChartDataPoint[] = [
	// 	{ legend: "durationOutboundBatching", data: 2, color: tokens.colorBrandForeground1 },
	// 	{ legend: "durationNetwork", data: 3, color: tokens.colorBrandForeground2 },
	// 	{
	// 		legend: "durationInboundToProcessing",
	// 		data: 3,
	// 		color: tokens.colorBrandForegroundInverted,
	// 	},
	// ];
	// const points4: IChartDataPoint[] = [
	// 	{ legend: "durationOutboundBatching", data: 2, color: tokens.colorBrandForeground1 },
	// 	{ legend: "durationNetwork", data: 1, color: tokens.colorBrandForeground2 },
	// 	{
	// 		legend: "durationInboundToProcessing",
	// 		data: 2,
	// 		color: tokens.colorBrandForegroundInverted,
	// 	},
	// ];

	// const data: IChartProps[] = [
	// 	{
	// 		chartTitle: "Op 1",
	// 		chartTitleAccessibilityData: { ariaLabel: "Perf measurements for Op 1" },
	// 		chartData: points1,
	// 	},
	// 	{
	// 		chartTitle: "Op 2",
	// 		chartTitleAccessibilityData: { ariaLabel: "Perf measurements for Op 2" },
	// 		chartData: points2,
	// 	},
	// 	{
	// 		chartTitle: "Op 3",
	// 		chartTitleAccessibilityData: { ariaLabel: "Perf measurements for Op 3" },
	// 		chartData: points3,
	// 	},
	// 	{
	// 		chartTitle: "Op 4",
	// 		chartTitleAccessibilityData: { ariaLabel: "Perf measurements for Op 4" },
	// 		chartData: points4,
	// 	},
	// ];

	const data: IChartProps[] | undefined = perfDataPoints?.map((x, index) => ({
		chartTitle: `Op ${index}`,
		// chartTitleAccessibilityData: { ariaLabel: "Perf measurements for Op 1" },
		chartData: x,
	}));

	return data !== undefined ? (
		<>
			<h3>Op Latency</h3>
			<MultiStackedBarChart
				data={data}
				width={600}
				focusZonePropsForLegendsInHoverCard={{ "aria-label": "legends Container" }}
				legendsOverflowText={"OverFlow Items"}
			/>
		</>
	) : (
		<Waiting label={"Waiting for Op Latency data"} />
	);
}
