/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Resizable } from "re-resizable";
import React from "react";

import {
	DebuggerRegistry,
	IFluidClientDebugger,
	getFluidClientDebuggers,
	getDebuggerRegistry,
} from "@fluid-tools/client-debugger";

import { DefaultPalette, IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { RenderOptions } from "./RendererOptions";
import { ClientDebugView, TelemetryView } from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";
import { MenuItem, MenuSection } from "./Menu";

// Ensure FluentUI icons are initialized.
initializeFluentUiIcons();

/**
 * {@link FluidClientDebuggers} input props.
 */
export interface FluidClientDebuggersProps {
	/**
	 * Rendering policies for different kinds of Fluid client and object data.
	 *
	 * @defaultValue Strictly use default visualization policies.
	 */
	renderOptions?: RenderOptions;
}

/**
 * Renders drop down to show more than 2 containers and manage the selected container in the debug view for an active
 * debugger session registered using {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebuggers(props: FluidClientDebuggersProps): React.ReactElement {
	const debuggerRegistry: DebuggerRegistry = getDebuggerRegistry();

	const [clientDebuggers, setClientDebuggers] = React.useState<IFluidClientDebugger[]>(
		getFluidClientDebuggers(),
	);
	const [menuSelection, setMenuSelection] = React.useState<string>("");
	const [containerId, setContainerId] = React.useState<string>("");

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

	let innerView: React.ReactElement;
	switch (menuSelection) {
		case "telemetry":
			innerView = <TelemetryView />;
			break;
		case "container":
			// eslint-disable-next-line no-case-declarations
			const containerDebugger = clientDebuggers.find((x) => x.containerId === containerId);
			innerView =
				containerDebugger === undefined ? (
					<div>Could not find a debugger for that container.</div>
				) : (
					<ClientDebugView clientDebugger={containerDebugger} />
				);
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
			color: DefaultPalette.black,
			display: "flex",
			justifyContent: "center",
		},
	};

	const menuStyles: IStackItemStyles = {
		root: {
			...contentViewStyles,
			display: "flex",
			flexDirection: "column",
			borderRight: `1px solid ${DefaultPalette.themePrimary}`,
			minWidth: 150
		},
	};

	function onContainerClicked(id: string): void {
		setMenuSelection("container");
		setContainerId(id);
	}

	function onTelemetryClicked(): void {
		setMenuSelection("telemetry");
	}

	return (
		<Resizable
			style={{
				position: "absolute",
				top: "0px",
				right: "0px",
				bottom: "0px",
				zIndex: "2",
				backgroundColor: "lightgray", // TODO: remove
			}}
			defaultSize={{ width: 400, height: "100%" }}
			className={"debugger-panel"}
		>
			<Stack enableScopedSelectors horizontal styles={stackStyles}>
				<Stack.Item grow={1} styles={menuStyles}>
					<MenuSection header="Containers">
						{clientDebuggers.map((clientDebugger) => (
							<MenuItem
								key={clientDebugger.containerId}
								text={
									clientDebugger.containerNickname ?? clientDebugger.containerId
								}
								onClick={(event): void => {
									onContainerClicked(`${clientDebugger.containerId}`);
								}}
							/>
						))}
					</MenuSection>
					<MenuSection header="Telemetry">
						<MenuItem text="See Telemetry" onClick={onTelemetryClicked} />
					</MenuSection>
				</Stack.Item>
				<Stack.Item grow={5} styles={contentViewStyles}>
					<div id="debugger-view-content" style={{ width: "100%", height: "100%", overflowY: "auto" }}>
						{innerView}
					</div>
				</Stack.Item>
			</Stack>
		</Resizable>
	);
}
