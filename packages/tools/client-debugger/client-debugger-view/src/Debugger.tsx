/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Resizable } from "re-resizable";
import React from "react";

import {
	ContainerMetadata,
	IMessageRelay,
	InboundHandlers,
	RegistryChangeMessage,
	ISourcedDebuggerMessage,
	handleIncomingMessage,
	IDebuggerMessage,
} from "@fluid-tools/client-debugger";

import { DefaultPalette, IStackItemStyles, IStackStyles, Stack } from "@fluentui/react";
import { RenderOptions } from "./RendererOptions";
import { ContainerView, TelemetryView, MenuItem, MenuSection, LandingView } from "./components";
import { initializeFluentUiIcons } from "./InitializeIcons";
import { useMessageRelay } from "./MessageRelayContext";

const loggingContext = "INLINE(DebuggerPanel)";

// Ensure FluentUI icons are initialized.
initializeFluentUiIcons();

/**
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage: IDebuggerMessage = {
	type: "GET_CONTAINER_LIST",
	data: undefined,
};

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

interface ContainerMenuSelection {
	type: "containerMenuSelection";
	containerId: string;
}

interface TelemetryMenuSelection {
	type: "telemetryMenuSelection";
}

type MenuSelection = TelemetryMenuSelection | ContainerMenuSelection;

/**
 * Renders drop down to show more than 2 containers and manage the selected container in the debug view for an active
 * debugger session registered using {@link @fluid-tools/client-debugger#initializeFluidClientDebugger}.
 *
 * @remarks If no debugger has been initialized, will display a note to the user and a refresh button to search again.
 */
export function FluidClientDebuggers(props: FluidClientDebuggersProps): React.ReactElement {
	const [containers, setContainers] = React.useState<ContainerMetadata[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection | undefined>();

	const messageRelay: IMessageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			["REGISTRY_CHANGE"]: (untypedMessage) => {
				const message = untypedMessage as RegistryChangeMessage;
				setContainers(message.data.containers);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDebuggerMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [setContainers, messageRelay]);

	let innerView: React.ReactElement;
	switch (menuSelection?.type) {
		case "telemetryMenuSelection":
			innerView = <TelemetryView />;
			break;
		case "containerMenuSelection":
			// eslint-disable-next-line no-case-declarations
			const container = containers?.find((x) => x.id === menuSelection.containerId);
			innerView =
				container === undefined ? (
					<div>Could not find a debugger for that container.</div>
				) : (
					<ContainerView containerId={menuSelection.containerId} />
				);
			break;
		default:
			innerView = <LandingView />;
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
			minWidth: 150,
		},
	};

	function onContainerClicked(id: string): void {
		setMenuSelection({ type: "containerMenuSelection", containerId: id });
	}

	function onTelemetryClicked(): void {
		setMenuSelection({ type: "telemetryMenuSelection" });
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
					{/* TODO: button to refresh list of containers */}
					<MenuSection header="Containers">
						{containers?.map((container) => (
							<MenuItem
								key={container.id}
								isActive={
									menuSelection?.type === "containerMenuSelection" &&
									menuSelection.containerId === container.id
								}
								text={container.nickname ?? container.id}
								onClick={(event): void => {
									onContainerClicked(`${container.id}`);
								}}
							/>
						))}
					</MenuSection>
					<MenuSection header="Telemetry">
						<MenuItem
							isActive={menuSelection?.type === "telemetryMenuSelection"}
							text="See Telemetry"
							onClick={onTelemetryClicked}
						/>
					</MenuSection>
				</Stack.Item>
				<Stack.Item grow={5} styles={contentViewStyles}>
					<div
						id="debugger-view-content"
						style={{ width: "100%", height: "100%", overflowY: "auto" }}
					>
						{innerView}
					</div>
				</Stack.Item>
			</Stack>
		</Resizable>
	);
}
