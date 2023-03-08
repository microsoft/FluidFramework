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

import { RenderOptions } from "./RendererOptions";
import { ContainerSelectionDropdown, MainView } from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";

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

	// This function is pure, so there are no state concerns here.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	function getDefaultDebuggerSelectionId(options: IFluidClientDebugger[]): string | undefined {
		return options.length === 0 ? undefined : options[0].containerId;
	}

	const [selectedContainerId, setSelectedContainerId] = React.useState<string | undefined>(
		getDefaultDebuggerSelectionId(clientDebuggers) ?? undefined,
	);

	React.useEffect(() => {
		function onDebuggerChanged(): void {
			const newDebuggerList = getFluidClientDebuggers();
			setClientDebuggers(newDebuggerList);
			if (selectedContainerId === undefined) {
				const newSelection = getDefaultDebuggerSelectionId(newDebuggerList);
				console.log(`Updating selection to container ID "${newSelection}".`);
				setSelectedContainerId(newSelection);
			}
		}

		debuggerRegistry.on("debuggerRegistered", onDebuggerChanged);
		debuggerRegistry.on("debuggerClosed", onDebuggerChanged);

		return (): void => {
			debuggerRegistry.off("debuggerRegistered", onDebuggerChanged);
			debuggerRegistry.off("debuggerClosed", onDebuggerChanged);
		};
	}, [getDefaultDebuggerSelectionId, selectedContainerId, debuggerRegistry, setClientDebuggers]);

	const selectionView: React.ReactElement =
		clientDebuggers.length > 1 ? (
			<ContainerSelectionDropdown
				initialSelection={selectedContainerId}
				options={clientDebuggers.map((clientDebugger) => ({
					id: clientDebugger.containerId,
					nickname: clientDebugger.containerNickname,
				}))}
				onChangeSelection={(containerId): void => setSelectedContainerId(containerId)}
			/>
		) : (
			<></>
		);

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
			{selectionView}
			<MainView></MainView>
		</Resizable>
	);
}
