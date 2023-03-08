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
} from "@fluentui/react";
import { SelectTabData, SelectTabEvent, Tab, TabList, TabValue } from "@fluentui/react-tabs";
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
	const [selectedValue, setSelectedValue] = React.useState<TabValue>("conditions");

	const onTabSelect = (event: SelectTabEvent, data: SelectTabData): void => {
		setSelectedValue(data.value);
	};

	// eslint-disable-next-line prefer-arrow-callback
	const Arrivals = React.memo(function Arrivals() {
		return (
			<div role="tabpanel" aria-labelledby="Arrivals">
				<table>
					<thead>
						<th>Origin</th>
						<th>Gate</th>
						<th>ETA</th>
					</thead>
					<tbody>
						<tr>
							<td>DEN</td>
							<td>C3</td>
							<td>12:40 PM</td>
						</tr>
						<tr>
							<td>SMF</td>
							<td>D1</td>
							<td>1:18 PM</td>
						</tr>
						<tr>
							<td>SFO</td>
							<td>E18</td>
							<td>1:42 PM</td>
						</tr>
					</tbody>
				</table>
			</div>
		);
	});

	// Styles definition
	const stackStyles: IStackStyles = {
		root: {
			background: DefaultPalette.themeTertiary,
			height: 500
		},
	};
	const stackItemStyles: IStackItemStyles = {
		root: {
			alignItems: "center",
			background: DefaultPalette.themePrimary,
			color: DefaultPalette.white,
			display: "flex",
			justifyContent: "center",
		},
	};

	// Tokens definition
	const stackTokens: IStackTokens = {
		childrenGap: 5,
		padding: 10,
	};

	return (
		<Stack enableScopedSelectors horizontal styles={stackStyles} tokens={stackTokens}>
			<Stack.Item styles={stackItemStyles}>
				<TabList vertical selectedValue={selectedValue} onTabSelect={onTabSelect}>
					<Tab id="Arrivals" value="arrivals">
						Arrivals
					</Tab>
					<Tab id="Audience" value="audience">
						Audience
					</Tab>
					<Tab id="Telemetry" value="telemetry">
						Telemetry
					</Tab>
				</TabList>
			</Stack.Item>
			<Stack.Item grow={2} styles={stackItemStyles}>
				<div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
					{selectedValue === "arrivals" && <Arrivals />}
					{/* {selectedValue === "audience" && <AudienceView />} */}
					{selectedValue === "telemetry" && <TelemetryView />}
				</div>
			</Stack.Item>
		</Stack>
	);
}
