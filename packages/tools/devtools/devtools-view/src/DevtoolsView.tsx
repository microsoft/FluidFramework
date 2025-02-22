/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluentProvider, makeStyles, shorthands, tokens } from "@fluentui/react-components";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	type ContainerKey,
	ContainerList,
	type DevtoolsFeatureFlags,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	type ISourcedDevtoolsMessage,
	type InboundHandlers,
	handleIncomingMessage,
} from "@fluidframework/devtools-core/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import React from "react";

import { useMessageRelay } from "./MessageRelayContext.js";
import {
	ConsoleVerboseLogger,
	LoggerContext,
	TelemetryOptInLogger,
} from "./TelemetryUtils.js";
import { ThemeContext, getFluentUIThemeToUse } from "./ThemeHelper.js";
import {
	ContainerDevtoolsView,
	LandingView,
	Menu,
	type MenuSelection,
	NoDevtoolsErrorBar,
	OpLatencyView,
	SettingsView,
	TelemetryConsentModal,
	TelemetryView,
	Waiting,
} from "./components/index.js";

const loggingContext = "INLINE(DevtoolsView)";

const telemetryConsentKey = "Fluid.Devtools.Telemetry.Consent";

/**
 * Message sent to the webpage to query for the supported set of Devtools features.
 */
const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();

/**
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage = GetContainerList.createMessage();

const useDevtoolsStyles = makeStyles({
	root: {
		"display": "flex",
		"flexDirection": "row",
		"width": "100%",
		"height": "100%",
		"overflowY": "auto",
		"> *": {
			textOverflow: "ellipsis",
		},
	},
});

/**
 * {@link DevtoolsView} input props.
 */
export interface DevtoolsViewProps {
	/**
	 * Telemetry base logger passed from the {@link DevtoolsPanel}.
	 * Passed in to {@link DevtoolsView} since it receives the {@link DevtoolsFeatures.Message}.
	 */
	usageTelemetryLogger?: ITelemetryBaseLogger;
}

/**
 * Primary Fluid Framework Devtools view.
 *
 * @remarks
 *
 * Communicates with {@link @fluidframework/devtools-core#FluidDevtools} via {@link MessageRelayContext} to get
 * runtime-level stats to display, as well as the list of Container-level Devtools instances to display as menu options
 * and sub-views.
 *
 * Requires {@link MessageRelayContext} to have been set.
 */
export function DevtoolsView(props: DevtoolsViewProps): React.ReactElement {
	const { usageTelemetryLogger } = props;

	// Set of features supported by the Devtools.
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();
	const [queryTimedOut, setQueryTimedOut] = React.useState(false);
	const [selectedTheme, setSelectedTheme] = React.useState(getFluentUIThemeToUse());

	const [isMessageDismissed, setIsMessageDismissed] = React.useState(false);
	const [modalVisible, setModalVisible] = React.useState(false);

	React.useEffect(() => {
		const displayed = localStorage.getItem(telemetryConsentKey);
		if (displayed === null || displayed !== "true") {
			setModalVisible(true);
			localStorage.setItem(telemetryConsentKey, "true");
		}
	}, []);

	const queryTimeoutInMilliseconds = 30_000; // 30 seconds
	const messageRelay = useMessageRelay();

	const consoleLogger = React.useMemo(
		() => new ConsoleVerboseLogger(usageTelemetryLogger),
		[usageTelemetryLogger],
	);
	const telemetryOptInLogger = React.useMemo(
		() => new TelemetryOptInLogger(consoleLogger),
		[consoleLogger],
	);

	const [topLevelLogger, setTopLevelLogger] = React.useState(
		createChildLogger({ logger: telemetryOptInLogger }),
	);

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[DevtoolsFeatures.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DevtoolsFeatures.Message;
				setSupportedFeatures(message.data.features);

				const newTopLevelLogger = createChildLogger({
					logger: telemetryOptInLogger,
					properties: {
						all: {
							devtoolsVersion: message.data.devtoolsVersion,
						},
					},
				});

				newTopLevelLogger.sendTelemetryEvent({
					eventName: "DevtoolsConnected",
				});

				setTopLevelLogger(newTopLevelLogger);

				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Query for supported feature set
		messageRelay.postMessage(getSupportedFeaturesMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setSupportedFeatures, telemetryOptInLogger]);

	// Manage the query timeout
	React.useEffect(() => {
		if (supportedFeatures === undefined) {
			// If we have queried for the supported feature list but have not received
			// a response yet, queue a timer.
			const queryTimer = setTimeout(() => {
				setQueryTimedOut(true);
			}, queryTimeoutInMilliseconds);
			return (): void => {
				clearTimeout(queryTimer);
			};
		}
	}, [supportedFeatures, setQueryTimedOut]);

	function retryQuery(): void {
		setQueryTimedOut(false);
		messageRelay.postMessage(getSupportedFeaturesMessage);
	}

	return (
		<LoggerContext.Provider value={topLevelLogger}>
			<ThemeContext.Provider value={{ themeInfo: selectedTheme, setTheme: setSelectedTheme }}>
				<FluentProvider theme={selectedTheme.theme} style={{ height: "100%" }}>
					{supportedFeatures === undefined ? (
						<>
							{!queryTimedOut && <Waiting />}
							{queryTimedOut && !isMessageDismissed && (
								<NoDevtoolsErrorBar
									dismiss={(): void => setIsMessageDismissed(true)}
									retrySearch={(): void => retryQuery()}
								/>
							)}
							{modalVisible && (
								<TelemetryConsentModal onClose={(): void => setModalVisible(false)} />
							)}
							<_DevtoolsView supportedFeatures={{}} />
						</>
					) : (
						<>
							{modalVisible && (
								<TelemetryConsentModal onClose={(): void => setModalVisible(false)} />
							)}
							<_DevtoolsView supportedFeatures={supportedFeatures} />
						</>
					)}
				</FluentProvider>
			</ThemeContext.Provider>
		</LoggerContext.Provider>
	);
}

interface _DevtoolsViewProps {
	/**
	 * Set of features supported by the Devtools.
	 */
	supportedFeatures: DevtoolsFeatureFlags;
}

/**
 * Internal {@link DevtoolsView}, displayed once the supported feature set has been acquired from the webpage.
 */
function _DevtoolsView(props: _DevtoolsViewProps): React.ReactElement {
	const { supportedFeatures } = props;

	const [containers, setContainers] = React.useState<ContainerKey[] | undefined>();
	const [menuSelection, setMenuSelection] = React.useState<MenuSelection>({
		type: "homeMenuSelection",
	});
	const messageRelay = useMessageRelay();

	React.useEffect(() => {
		/**
		 * Handlers for inbound messages related to the registry.
		 */
		const inboundMessageHandlers: InboundHandlers = {
			[ContainerList.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ContainerList.Message;
				setContainers(message.data.containers);
				return true;
			},
		};

		/**
		 * Event handler for messages coming from the Message Relay
		 */
		function messageHandler(message: Partial<ISourcedDevtoolsMessage>): void {
			handleIncomingMessage(message, inboundMessageHandlers, {
				context: loggingContext,
			});
		}

		messageRelay.on("message", messageHandler);

		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);

		return (): void => {
			messageRelay.off("message", messageHandler);
		};
	}, [messageRelay, setContainers]);

	const styles = useDevtoolsStyles();

	return (
		<div className={styles.root}>
			<Menu
				currentSelection={menuSelection}
				setSelection={setMenuSelection}
				containers={containers}
				supportedFeatures={supportedFeatures}
			/>
			<div style={{ width: "1px", backgroundColor: tokens.colorNeutralForeground1 }}></div>
			<View menuSelection={menuSelection} containers={containers} />
		</div>
	);
}

const useViewStyles = makeStyles({
	root: {
		...shorthands.padding("10px"),
		alignItems: "center",
		display: "flex",
		flexDirection: "column",
		height: "100%",
		width: "100%",
		minWidth: "200px",
		overflowY: "auto",
		boxSizing: "border-box",
	},
});

/**
 * {@link View} input props.
 */
interface ViewProps {
	/**
	 * The current menu selection.
	 *
	 * @remarks `undefined` indicates that the landing page should be displayed.
	 */
	menuSelection?: MenuSelection;

	/**
	 * The list of Containers, if any are registered with the webpage's Devtools instance.
	 */
	containers?: ContainerKey[];
}

/**
 * View body component used by {@link DevtoolsView}.
 */
function View(props: ViewProps): React.ReactElement {
	const { menuSelection, containers } = props;

	const styles = useViewStyles();

	let view: React.ReactElement;
	switch (menuSelection?.type) {
		case "telemetryMenuSelection": {
			view = <TelemetryView />;
			break;
		}
		case "containerMenuSelection": {
			const container: ContainerKey | undefined = containers?.find(
				(containerKey) => containerKey === menuSelection.containerKey,
			);
			view =
				container === undefined ? (
					<div>Could not find a Devtools instance for that container.</div>
				) : (
					<ContainerDevtoolsView containerKey={menuSelection.containerKey} />
				);
			break;
		}
		case "settingsMenuSelection": {
			view = <SettingsView />;
			break;
		}
		case "homeMenuSelection": {
			view = <LandingView />;
			break;
		}
		case "opLatencyMenuSelection": {
			view = <OpLatencyView />;
			break;
		}
		default: {
			view = <LandingView />;
			break;
		}
	}

	return <div className={styles.root}>{view}</div>;
}
