/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IconButton, Stack, StackItem, TooltipHost } from "@fluentui/react";
import { useId } from "@fluentui/react-hooks";
import React from "react";

import { IFluidClientDebugger, getFluidClientDebugger } from "@fluid-tools/client-debugger";

import { HasContainerId } from "./CommonProps";
import { RenderOptions } from "./RendererOptions";
import { ClientDebugView } from "./components";

/**
 * {@link FluidClientDebugger} input props.
 */
export interface FluidClientDebuggerProps extends HasContainerId {
	/**
	 * Rendering policies for different kinds of Fluid client and object data.
	 *
	 * @defaultValue Strictly use default visualization policies.
	 */
	renderOptions?: RenderOptions;
}

/**
 * Renders the Client debug view by searching for an active debugger session associated with the provided
 * {@link HasContainerId.containerId}.
 *
 * @remarks If no debugger corresponding with the specified `containerId`
 * has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebugger(props: FluidClientDebuggerProps): React.ReactElement {
	const { containerId } = props;

	const [clientDebugger, setClientDebugger] = React.useState<IFluidClientDebugger | undefined>(
		getFluidClientDebugger(containerId),
	);

	const [isContainerDisposed, setIsContainerDisposed] = React.useState<boolean>(
		clientDebugger?.disposed ?? false,
	);

	React.useEffect(() => {
		function onDebuggerDisposed(): void {
			setIsContainerDisposed(true);
		}

		clientDebugger?.on("debuggerDisposed", onDebuggerDisposed);

		return (): void => {
			clientDebugger?.off("debuggerDisposed", onDebuggerDisposed);
		};
	}, [clientDebugger, setIsContainerDisposed]);

	if (clientDebugger === undefined) {
		return (
			<NoDebuggerInstance
				containerId={containerId}
				onRetryDebugger={(): void => setClientDebugger(getFluidClientDebugger(containerId))}
			/>
		);
	}

	if (isContainerDisposed) {
		return (
			<DebuggerDisposed
				containerId={containerId}
				onRetryDebugger={(): void => setClientDebugger(getFluidClientDebugger(containerId))}
			/>
		);
	}

	return <ClientDebugView containerId={containerId} clientDebugger={clientDebugger} />;
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
interface NoDebuggerInstanceProps extends HasContainerId, CanLookForDebugger {}

function NoDebuggerInstance(props: NoDebuggerInstanceProps): React.ReactElement {
	const { containerId, onRetryDebugger } = props;

	const retryButtonTooltipId = useId("retry-button-tooltip");

	// TODO: give more info and link to docs, etc. for using the tooling.
	return (
		<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
			<StackItem>
				<div>No debugger has been initialized for container ID "${containerId}".</div>
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

/**
 * {@link DebuggerDisposed} input props.
 */
interface DebuggerDisposedProps extends HasContainerId, CanLookForDebugger {}

function DebuggerDisposed(props: DebuggerDisposedProps): React.ReactElement {
	const { containerId, onRetryDebugger } = props;

	const retryButtonTooltipId = useId("retry-button-tooltip");

	return (
		<Stack horizontalAlign="center" tokens={{ childrenGap: 10 }}>
			<StackItem>
				<div>
					The debugger associated with container ID "${containerId}" has been disposed.
				</div>
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
