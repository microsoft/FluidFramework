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
import { DebuggerRegistry, getDebuggerRegistry, getFluidClientDebuggers, IFluidClientDebugger } from "@fluid-tools/client-debugger";
import React from "react";

import { initializeFluentUiIcons } from "../InitializeIcons";
// import { NewTelemetryView } from "./NewTelemetryView";
// import { AudienceView } from "./AudienceView";
import { TelemetryView } from "./TelemetryView";
import { MenuItem, MenuSection } from "./utility-components";

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
	const debuggerRegistry: DebuggerRegistry = getDebuggerRegistry();

	const [clientDebuggers, setClientDebuggers] = React.useState<IFluidClientDebugger[]>(
		getFluidClientDebuggers(),
	);

	React.useEffect(() => {
		function onDebuggerChanged(): void {
			const newDebuggerList = getFluidClientDebuggers();
			setClientDebuggers(newDebuggerList);
		}

		debuggerRegistry.on("debuggerRegistered", onDebuggerChanged);
		debuggerRegistry.on("debuggerClosed", onDebuggerChanged);

		return (): void => {
			debuggerRegistry.off("debuggerRegistered", onDebuggerChanged);
			debuggerRegistry.off("debuggerClosed", onDebuggerChanged);
		};
	}, [debuggerRegistry, setClientDebuggers]);

	const [menuSelection, setMenuSelection] = React.useState<string>("");
	const [containerId, setContainerId] = React.useState<string>("");

	let innerView: React.ReactElement;
	switch (menuSelection) {
		case "telemetry":
			innerView = <TelemetryView />;
			break;
		case "audience":
			// innerView = (
			// 	<AudienceView
			// 		clientDebugger={clientDebugger}
			// 		onRenderAudienceMember={renderOptions.onRenderAudienceMember}
			// 	/>
			// );
			innerView = <div>Audience view goes here</div>;
			break;
		case "container":
			innerView = <div>View for container {containerId}</div>;
			break;
		// TODO: add the Telemetry view here, without ReactContext
		default:
			innerView = <div>Select an option from the menu</div>;
			break;
	}

	// Styles definition
	const stackStyles: IStackStyles = {
		root: {
			background: DefaultPalette.themeTertiary,
			height: 500,
		},
	};
	const contentViewStyles: IStackItemStyles = {
		root: {
			alignItems: "center",
			background: DefaultPalette.themeLight,
			color: DefaultPalette.white,
			display: "flex",
			justifyContent: "center",
		},
	};

	const menuStyles: IStackItemStyles = {
		root: { ...contentViewStyles, "display": "flex", "flex-direction": "column" },
	};

	// Tokens definition
	const stackTokens: IStackTokens = {
		childrenGap: 5,
		padding: 10,
	};

	function onContainerClicked(id: string): void {
		setMenuSelection("container");
		setContainerId(id);
	}

	function onAudienceClicked(): void {
		setMenuSelection("audience");
	}

	function onTelemetryClicked(): void {
		setMenuSelection("telemetry");
	}

	return (
		<Stack enableScopedSelectors horizontal styles={stackStyles} tokens={stackTokens}>
			<Stack.Item grow={1} styles={menuStyles}>
				<MenuSection header="Containers">
					{
					clientDebuggers.map((clientDebugger) => (
						<MenuItem
							key={clientDebugger.containerId}
							text={clientDebugger.containerNickname ?? clientDebugger.containerId}
							onClick={(event): void => { onContainerClicked(`container:${clientDebugger.containerId}`); }}/>
					))}
				</MenuSection>
				<MenuSection header="Telemetry">
					<MenuItem text="See Telemetry" onClick={onTelemetryClicked} />
				</MenuSection>
				<MenuSection header="Audience">
					<MenuItem text="See Audience" onClick={onAudienceClicked} />
				</MenuSection>
			</Stack.Item>
			<Stack.Item grow={5} styles={contentViewStyles}>
				<div style={{ width: "100%", height: "100%", overflowY: "auto" }}>
					{innerView}
				</div>
			</Stack.Item>
		</Stack>
	);
}
