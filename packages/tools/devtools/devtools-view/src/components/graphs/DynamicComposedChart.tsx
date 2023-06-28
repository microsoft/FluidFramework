/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Recharts does not have types for many objects at this time. For now, these eslint disable directive should be active until we create our own types for recharts
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Theme } from "@fluentui/react-components";
import React, { useState } from "react";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	Legend,
	Line,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ThemeContext } from "../../ThemeHelper";

/**
 * Data To be rendered with Op Latency Graph
 */
export interface GraphDataSet {
	graphType: "line" | "area" | "bar";
	schema: {
		displayName: string;
		uuid: string;
		xAxisDataKey: string;
		yAxisDataKey: string;
	};
	data: { [key: string]: number | string }[];
}

/**
 * The final shape of the data points passed to the recharts component
 */
interface DataPoint {
	x: string;
	[key: string]: number | string;
}

/**
 * Merges multiple {@link GraphDataSet}'s into singular objects by their y-axis (timestamp) value.
 * This method is necessary for showing composed graphs beacause Recharts expects data to be in a merged object format
 */
const mergeDataSets = (dataSets: GraphDataSet[]): DataPoint[] => {
	const xAxisDataPointToYAxisDataPointMap: Record<string, Record<string, number | string>> = {};

	for (const dataSet of dataSets) {
		const { yAxisDataKey, xAxisDataKey, uuid } = dataSet.schema;
		for (const dataPoint of dataSet.data) {
			const xAxisDataPoint = dataPoint[xAxisDataKey];
			xAxisDataPointToYAxisDataPointMap[xAxisDataPoint] = {
				...xAxisDataPointToYAxisDataPointMap[xAxisDataPoint],
				[uuid]: dataPoint[yAxisDataKey],
			};
		}
	}

	return Object.keys(xAxisDataPointToYAxisDataPointMap).map((xAxisKey) => {
		return {
			x: xAxisKey,
			...xAxisDataPointToYAxisDataPointMap[xAxisKey],
		};
	});
};

interface Props {
	stackedGraphType?: "area" | "bar";
	dataSets: GraphDataSet[];
	yAxisUnitDisplayName?: string;
}

/**
 * Creates a palette of colors to be used by the DynamicComposedChart.
 * Because this is using colors from the Fluent ui theme object,
 * they will automatically update based on the selected theme mode.
 * The one exception is that for high contrast we override the graph colors because
 * Fluent defaults many of them to the same color.
 *
 * High contrast colors sourced from Fluent Ui React color palette
 * https://react.fluentui.dev/?path=/docs/theme-colors--page
 */
const createGraphColorPalette = (
	themeMode: string,
	theme: Theme,
): {
	gray: string;
	graphColors: string[];
} => {
	switch (themeMode) {
		case "light":
		case "dark":
		default:
			return {
				gray: theme.colorNeutralForeground2,
				graphColors: [
					theme.colorPaletteBerryForeground1,
					theme.colorPaletteMarigoldForeground1,
					theme.colorPaletteLightGreenForeground1,
					theme.colorPaletteLavenderForeground2,
				],
			};
		case "highContrast":
			return {
				gray: theme.colorNeutralForeground2,
				graphColors: [
					"#3ff23f", // Neon green
					"#ffff00", // Neon yellow
					"#1aebff", // Neon blue
					"#ffffff", // pure white
				],
			};
	}
};

/**
 * This component is a wrapper over Recharts ComposedChart component that provides
 * an easy way to create composed charts from disparate sets of data.
 */
export function DynamicComposedChart(props: Props): React.ReactElement {
	const [activeIndex, setActiveIndex] = useState<string | undefined>();
	const { themeInfo } = React.useContext(ThemeContext) ?? {};

	console.log("themeInfo", themeInfo);

	const graphColorPalette = createGraphColorPalette(themeInfo.name, themeInfo.theme);

	const handleLegendClick = (e): void => {
		setActiveIndex(activeIndex === e.dataKey ? undefined : (e.dataKey as string));
	};

	/**
	 * Renders a custom component for the graph legend
	 */
	// Recharts doesn't have a type for this
	const renderLegend = (legendProps: any): React.ReactElement => {
		const { payload } = legendProps;

		return (
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					flexWrap: "wrap",
					justifyContent: "center",
				}}
			>
				{payload.map((entry: any, index: number) => {
					const legendColor: string =
						activeIndex === entry.dataKey || activeIndex === undefined
							? entry.color
							: themeInfo.theme.colorNeutralStroke1;

					return (
						<div
							key={`item-${index}`}
							// eslint-disable-next-line @typescript-eslint/no-unsafe-return
							onClick={(): void => legendProps.onClick(entry)}
							style={{ color: legendColor, width: "33%", fontSize: 16 }}
						>
							{/* This SVG is a line with a dot in the middle */}
							<svg
								width="14"
								height="14"
								style={{ verticalAlign: "middle", marginRight: "5px" }}
							>
								<line
									x1="0"
									y1="7"
									x2="14"
									y2="7"
									style={{ stroke: legendColor, strokeWidth: "2" }}
								/>
								<circle cx="7" cy="7" r="3" fill={legendColor} />
							</svg>
							{entry.value}
						</div>
					);
				})}
			</div>
		);
	};

	/**
	 * Renders a custom view for the X Axis displayed on the Rechart chart
	 */
	// Recharts doesn't have a type for this
	const CustomizedXAxisTick = (xAxisProps: any): React.ReactElement => {
		const { x, y, payload } = xAxisProps;
		return (
			<g transform={`translate(${x},${y})`}>
				<text
					x={0}
					y={0}
					dy={16}
					textAnchor="end"
					fill={graphColorPalette.gray}
					transform="rotate(-35)"
					fontSize={16}
				>
					{payload.value}
				</text>
			</g>
		);
	};

	/**
	 * Renders a custom view for the Y Axis displayed on the Rechart chart
	 */
	// Recharts doesn't have a type for this
	const CustomizedYAxisTick = (yAxisProps: any): React.ReactElement => {
		const { x, y, payload } = yAxisProps;
		return (
			<g>
				<text x={x} y={y} textAnchor="end" fill={graphColorPalette.gray} fontSize={16}>
					{`${payload.value}${props.yAxisUnitDisplayName ?? ""}`}
				</text>
			</g>
		);
	};

	/**
	 * Create a rechart graph component to be displayed on a chart
	 * @param graphType - the type of graph to render, either line or area
	 * @param name - name of the dataset, will be shown on the graph
	 * @param hexColor - color of the graph line
	 * @param dataKey - unique key within the merged dataset that this chart will be graphing
	 * @returns A Rechart graph component to be placed as a child within a Rechart chart component
	 */
	const renderChartData = (
		graphType: "line" | "area" | "bar",
		name: string,
		hexColor: string,
		dataKey: string,
	): React.ReactElement => {
		let fillOpacity = 0.45;
		if (activeIndex === dataKey) {
			fillOpacity = 0.85;
		} else if (activeIndex !== undefined) {
			fillOpacity = 0.15;
		}

		if (props.stackedGraphType === "area") {
			return (
				<Area
					name={name}
					key={dataKey}
					type="monotone"
					dataKey={dataKey}
					stroke={hexColor}
					fill={hexColor}
					activeDot={{ r: 6 }}
					strokeOpacity={fillOpacity}
					fillOpacity={fillOpacity}
					stackId={"1"}
				/>
			);
		}
		if (props.stackedGraphType === "bar") {
			return (
				<Bar
					name={name}
					key={dataKey}
					type="monotone"
					dataKey={dataKey}
					fill={hexColor}
					fillOpacity={activeIndex === undefined || activeIndex === dataKey ? 1 : 0.2}
					stackId={"1"}
				/>
			);
		}

		switch (graphType) {
			case "line":
			default:
				return (
					<Line
						name={name}
						key={dataKey}
						type="monotone"
						dataKey={dataKey}
						stroke={hexColor}
						strokeWidth={3}
						activeDot={{ r: 6 }}
						strokeOpacity={
							activeIndex === undefined || activeIndex === dataKey ? 1 : 0.2
						}
					/>
				);
			case "area":
				return (
					<Area
						name={name}
						key={dataKey}
						type="monotone"
						dataKey={dataKey}
						stroke={hexColor}
						fill={hexColor}
						activeDot={{ r: 6 }}
						strokeOpacity={fillOpacity}
						fillOpacity={fillOpacity}
					/>
				);
			case "bar":
				return (
					<Bar
						name={name}
						key={dataKey}
						type="monotone"
						dataKey={dataKey}
						fill={hexColor}
						fillOpacity={activeIndex === undefined || activeIndex === dataKey ? 1 : 0.2}
					/>
				);
		}
	};

	/**
	 * Utilizes an array of {@link GraphDataSet} objects to generate a cooresponding array of rechart graph components
	 */
	const renderChartComponentsFromGraphDataSets = (
		dataSets: GraphDataSet[],
	): React.ReactElement[] => {
		const graphComponents: React.ReactElement[] = [];
		let currColorPaletteIndex = 0;
		for (const dataSet of dataSets) {
			if (currColorPaletteIndex > graphColorPalette.graphColors.length - 1) {
				currColorPaletteIndex = 0;
			}

			graphComponents.push(
				renderChartData(
					dataSet.graphType,
					dataSet.schema.displayName,
					graphColorPalette.graphColors[currColorPaletteIndex],
					dataSet.schema.uuid,
				),
			);
			currColorPaletteIndex++;
		}

		return graphComponents;
	};

	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart
				data={mergeDataSets(props.dataSets)}
				margin={{
					top: 15,
					right: 30,
					left: 50,
					bottom: 40,
				}}
			>
				<CartesianGrid strokeDasharray="2 2" />
				<XAxis dataKey={"x"} tick={<CustomizedXAxisTick />} />
				<YAxis tick={<CustomizedYAxisTick />} />
				<Tooltip
					contentStyle={{
						fontSize: "14px",
						backgroundColor: themeInfo.theme.colorNeutralBackground1,
					}}
				/>
				<Legend
					wrapperStyle={{ bottom: "-10px", fontSize: "16px" }}
					onClick={handleLegendClick}
					content={renderLegend}
				/>

				{renderChartComponentsFromGraphDataSets(props.dataSets)}
			</ComposedChart>
		</ResponsiveContainer>
	);
}
