/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type BrandVariants,
	FluentProvider,
	Spinner,
	Text,
	type Theme,
	createLightTheme,
	makeStyles,
	shorthands,
} from "@fluentui/react-components";
import {
	CollaborativeTextArea,
	type SessionStorageModelLoader,
	SharedStringHelper,
} from "@fluid-example/example-utils";
import type { SharedCounter } from "@fluidframework/counter/internal";
import {
	type ContainerKey,
	type HasContainerKey,
	type IDevtoolsLogger,
	type IFluidDevtools,
	createDevtoolsLogger,
	initializeDevtools,
} from "@fluidframework/devtools-core/internal";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import React from "react";

import {
	type ContainerInfo,
	createContainer,
	createLoader,
	loadExistingContainer,
} from "./ClientUtilities.js";
import type { IAppModel } from "./Container.js";
import type { AppData } from "./FluidObject.js";
import { CounterWidget, EmojiGrid } from "./widgets/index.js";

const sharedContainerKey: ContainerKey = "Shared Container";
const privateContainerKey: ContainerKey = "Private Container";

/**
 * Helper function to read the Container ID from the URL location.
 */
function getContainerIdFromLocation(location: Location): string {
	return location.hash.slice(1);
}

/**
 * React hook for asynchronously creating / loading two Fluid Containers: a shared container whose ID is put in
 * the URL to enable collaboration, and a private container that is only exposed to the local user.
 */
function useContainerInfo(
	devtools: IFluidDevtools,
	logger: IDevtoolsLogger,
	loader: SessionStorageModelLoader<IAppModel>,
): {
	privateContainer: ContainerInfo | undefined;
	sharedContainer: ContainerInfo | undefined;
} {
	const [sharedContainerInfo, setSharedContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();
	const [privateContainerInfo, setPrivateContainerInfo] = React.useState<
		ContainerInfo | undefined
	>();

	// Get the Fluid Data data on app startup and store in the state
	React.useEffect(() => {
		async function getSharedFluidData(): Promise<ContainerInfo> {
			const containerId = getContainerIdFromLocation(window.location);
			return containerId.length === 0
				? createContainer(loader)
				: loadExistingContainer(containerId, loader);
		}

		async function getPrivateContainerData(): Promise<ContainerInfo> {
			// Always create a new container for the private view.
			// This isn't shared with other collaborators.
			return createContainer(loader);
		}

		getSharedFluidData().then((containerInfo) => {
			if (getContainerIdFromLocation(window.location) !== containerInfo.containerId) {
				window.location.hash = containerInfo.containerId;
				document.title = `Devtoolsl Example test app - ${containerInfo.containerId}`;
			}

			setSharedContainerInfo(containerInfo);
			devtools.registerContainerDevtools({
				container: containerInfo.container,
				containerKey: sharedContainerKey,
				containerData: containerInfo.appData.getRootObject(),
			});
		}, console.error);

		getPrivateContainerData().then((containerInfo) => {
			setPrivateContainerInfo(containerInfo);
			devtools.registerContainerDevtools({
				container: containerInfo.container,
				containerKey: privateContainerKey,
				containerData: containerInfo.appData.getRootObject(),
			});
		}, console.error);

		return (): void => {
			devtools?.dispose();
		};
	}, [devtools, loader, logger]);

	return {
		sharedContainer: sharedContainerInfo,
		privateContainer: privateContainerInfo,
	};
}

const appTheme: BrandVariants = {
	10: "#020305",
	20: "#111723",
	30: "#16263D",
	40: "#193253",
	50: "#1B3F6A",
	60: "#1B4C82",
	70: "#18599B",
	80: "#1267B4",
	90: "#3174C2",
	100: "#4F82C8",
	110: "#6790CF",
	120: "#7D9ED5",
	130: "#92ACDC",
	140: "#A6BAE2",
	150: "#BAC9E9",
	160: "#CDD8EF",
};

const lightTheme: Theme = {
	...createLightTheme(appTheme),
};

/**
 * Styles for the app components
 */
const useStyles = makeStyles({
	/**
	 * Root of the app (both internal app views + embedded devtools panel)
	 */
	root: {
		display: "flex",
		flexDirection: "row",
	},

	/**
	 * Container for the two app views
	 */
	appViewsContainer: {
		display: "flex",
		flexDirection: "row",
	},

	/**
	 * Styles for each inner app view
	 */
	appView: {
		display: "flex",
		flexDirection: "column",
		...shorthands.padding("10px"),
	},

	/**
	 * Styles for the loading view
	 */
	loadingAppView: {
		alignItems: "stretch", // Center the items horizontally
		display: "flex",
		flexDirection: "column",
		...shorthands.padding("10px"),
	},
});

/**
 * Root application component.
 * Initializes the Fluid Container and displays app view once it is ready.
 */
export function App(): React.ReactElement {
	// Initialize the Devtools logger
	const logger = React.useMemo(() => createDevtoolsLogger(), []);

	// Initialize the Fluid Container loader
	const loader = React.useMemo(() => createLoader(logger), [logger]);

	// Initialize Devtools
	const devtools = React.useMemo(() => initializeDevtools({ logger }), [logger]);

	React.useEffect(() => {
		// Dispose of devtools resources on teardown to ensure message listeners are notified.
		// Note that this isn't strictly necessary, as the Devtools will dispose of themselves on
		// window unload, but it is here for example completeness.
		return (): void => devtools.dispose();
	}, [devtools]);

	// Load the collaborative SharedString object
	const { privateContainer, sharedContainer } = useContainerInfo(devtools, logger, loader);

	const styles = useStyles();

	const view = (
		<div className={styles.appViewsContainer}>
			{sharedContainer === undefined ? (
				<LoadingView containerKey={sharedContainerKey} />
			) : (
				<AppView appData={sharedContainer.appData} containerKey={sharedContainerKey} />
			)}
			{privateContainer === undefined ? (
				<LoadingView containerKey={privateContainerKey} />
			) : (
				<AppView appData={privateContainer.appData} containerKey={privateContainerKey} />
			)}
		</div>
	);

	return (
		<FluentProvider theme={lightTheme} className={styles.root}>
			{view}
		</FluentProvider>
	);
}

type LoadingViewProps = HasContainerKey;

function LoadingView(props: LoadingViewProps): React.ReactElement {
	const { containerKey } = props;

	const styles = useStyles();

	return (
		<div className={styles.loadingAppView}>
			<Spinner />
			<Text>{`Loading ${containerKey}...`}</Text>
		</div>
	);
}

/**
 * {@link AppView} input props.
 */
interface AppViewProps extends HasContainerKey {
	/**
	 * Container object.
	 */
	appData: AppData;
}

/**
 * Inner app view.
 *
 * @remarks Valid to display once the container has been created / loaded.
 */
function AppView(props: AppViewProps): React.ReactElement {
	const { appData, containerKey } = props;

	const styles = useStyles();

	return (
		<div className={styles.appView}>
			<h4>{containerKey}</h4>
			<EmojiMatrixView emojiMatrix={appData.emojiMatrix} />
			<CounterView sharedCounter={appData.counter} />
			<TextView sharedText={appData.text} />
		</div>
	);
}

interface TextViewProps {
	sharedText: SharedString;
}

function TextView(props: TextViewProps): React.ReactElement {
	const { sharedText } = props;

	return sharedText === undefined ? (
		<Spinner />
	) : (
		<div className="example-app-text-area">
			<CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedText)} />
		</div>
	);
}

interface CounterViewProps {
	sharedCounter: SharedCounter;
}

function CounterView(props: CounterViewProps): React.ReactElement {
	const { sharedCounter } = props;

	return sharedCounter === undefined ? <Spinner /> : <CounterWidget counter={sharedCounter} />;
}

interface EmojiMatrixViewProps {
	emojiMatrix: SharedMatrix;
}

function EmojiMatrixView(props: EmojiMatrixViewProps): React.ReactElement {
	const { emojiMatrix } = props;

	return emojiMatrix === undefined ? <Spinner /> : <EmojiGrid emojiMatrix={emojiMatrix} />;
}
