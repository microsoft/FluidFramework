/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import { Resizable } from "re-resizable";
import React from "react";

import {
	DebuggerRegistry,
	IFluidClientDebugger,
	getFluidClientDebuggers,
	getDebuggerRegistry,
} from "@fluid-tools/client-debugger";

import { RenderOptions } from "./RendererOptions";
import { ClientDebugView, ContainerSelectionDropdown } from "./components";

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

	function getDefaultDebuggerSelectionId(options: IFluidClientDebugger[]): string | undefined {
		return options.length === 0 ? undefined : options[0].containerId;
	}

	const [selectedContainerId, setSelectedContainerId] = React.useState<string | undefined>(
		getDefaultDebuggerSelectionId(clientDebuggers) ?? undefined,
	);

	function getDebuggerFromContainerId(containerId: string): IFluidClientDebugger {
		const match = clientDebuggers.find(
			(clientDebugger) => clientDebugger.containerId === containerId,
		);
		if (match === undefined) {
			throw new Error(`No debugger found associated with Container ID "${containerId}".`);
		}
		return match;
	}

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

	const view =
		selectedContainerId === undefined ? (
			<NoDebuggerInstance
				onRetryDebugger={(): void => {
					const newDebuggerList = getFluidClientDebuggers();
					setClientDebuggers(newDebuggerList);
					const newDefaultId = getDefaultDebuggerSelectionId(newDebuggerList);
					setSelectedContainerId(newDefaultId);
				}}
			/>
		) : (
			<ClientDebugView
				clientDebugger={getDebuggerFromContainerId(selectedContainerId)}
				renderOptions={props.renderOptions}
			/>
		);

	const slectionView: React.ReactElement =
		clientDebuggers.length > 1 ? (
			<ContainerSelectionDropdown
				containerId={String(selectedContainerId)}
				clientDebuggers={clientDebuggers}
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
			{slectionView}
			{view}
		</Resizable>
	);
}

/**
 * Base props interface used by components below which can re-attempt to find the debugger instance
 * associated with some Container ID.
 */
interface CanLookForDebugger {
	/**
	 * Retry looking for the debugger instance.
	 */
	onRetryDebugger(): void;
}

/**
 * {@link NoDebuggerInstance} input props.
 */
type NoDebuggerInstanceProps = CanLookForDebugger;

function NoDebuggerInstance(props: NoDebuggerInstanceProps): React.ReactElement {
	const { onRetryDebugger } = props;

	const retryButtonTooltipId = useId("retry-button-tooltip");

	// TODO: give more info and link to docs, etc. for using the tooling.
	return (
		<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
			<StackItem>
				<div>No Fluid Client debuggers found.</div>
			</StackItem>
			<StackItem>
				<TooltipHost content="Look again" id={retryButtonTooltipId}>
					<IconButton
						onClick={onRetryDebugger}
						menuIconProps={{ iconName: "Refresh" }}
						aria-describedby={retryButtonTooltipId}
					/>
				</TooltipHost>
			</StackItem>
		</Stack>
	);
}
