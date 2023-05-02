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
import React from "react";
import { IChartProps, ILineChartDataPoint, LineChart } from "@fluentui/react-charting";

import {
	handleIncomingMessage,
	InboundHandlers,
	ISourcedDevtoolsMessage,
	TelemetryEvent,
} from "@fluid-tools/client-debugger";
import { DefaultPalette } from "@fluentui/react";
import { useMessageRelay } from "../MessageRelayContext";
import { Waiting } from "./Waiting";

/**
 * Displays op latency statistics and information.
 */
export function OpLatencyView(): React.ReactElement {
	const messageRelay = useMessageRelay();
	const [durationOutboundBatchingDataPoints, setDurationOutboundBatchingDataPoints] =
		React.useState<ILineChartDataPoint[] | undefined>();
	const [durationNetworkDataPoints, setDurationNetworkDataPoints] = React.useState<
		ILineChartDataPoint[] | undefined
	>();
	const [durationInboundToProcessingDataPoints, setDurationInboundToProcessingDataPoints] =
		React.useState<ILineChartDataPoint[] | undefined>();
	React.useEffect(() => {
		/**
		 * Handlers for inbound messages.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[TelemetryEvent.MessageType]: (untypedMessage) => {
				const message = untypedMessage as TelemetryEvent.Message;
				const eventContents = message.data.event.logContent;
				if (!eventContents.eventName.endsWith("OpRoundtripTime")) {
					return true;
				}

				console.log(`OP LATENCY: ${JSON.stringify(eventContents)}`);

				setDurationOutboundBatchingDataPoints((currentPoints) => [
					...(currentPoints ?? []),
					{
						x: message.data.event.timestamp,
						y: Number(eventContents.durationOutboundBatching),
					},
				]);

				setDurationNetworkDataPoints((currentPoints) => [
					...(currentPoints ?? []),
					{
						x: message.data.event.timestamp,
						y: Number(eventContents.durationNetwork),
					},
				]);

				setDurationInboundToProcessingDataPoints((currentPoints) => [
					...(currentPoints ?? []),
					{
						x: message.data.event.timestamp,
						y: Number(eventContents.durationInboundToProcessing),
					},
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
	}, [
		messageRelay,
		setDurationOutboundBatchingDataPoints,
		setDurationNetworkDataPoints,
		setDurationInboundToProcessingDataPoints,
	]);

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

	const data: IChartProps = {
		chartTitle: "Line Chart",
		lineChartData: [
			{
				legend: "durationOutboundBatching",
				data: durationOutboundBatchingDataPoints ?? [],
				color: DefaultPalette.blue,
			},
			{
				legend: "durationNetwork",
				data: durationNetworkDataPoints ?? [],
				color: DefaultPalette.green,
				lineOptions: {
					lineBorderWidth: "4",
				},
			},
			{
				legend: "durationInboundToProcessing",
				data: durationInboundToProcessingDataPoints ?? [],
				color: DefaultPalette.yellow,
			},
		],
	};

	const width = 300;
	const height = 600;
	const rootStyle = { width: `${width}px`, height: `${height}px`, backgroundColor: "#FFFFFF" };

	return data !== undefined ? (
		<>
			<h3>Op Latency</h3>
			<div style={rootStyle}>
				<LineChart
					culture={window.navigator.language}
					data={data}
					legendsOverflowText={"Overflow Items"}
					yMinValue={200}
					yMaxValue={301}
					height={height}
					width={width}
					// margins={margins}
					xAxisTickCount={10}
					// allowMultipleShapesForPoints={this.state.allowMultipleShapes}
				/>
			</div>
		</>
	) : (
		<Waiting label={"Waiting for Op Latency data"} />
	);
}
