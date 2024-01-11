/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
	GetDevtoolsFeatures,
	isDevtoolsMessage,
	DevtoolsFeatures,
	type ISourcedDevtoolsMessage,
} from "@fluidframework/devtools-core";
import { window } from "../Globals";

const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();

/**
 * Component that renders when you click extension
 * @returns popup component
 */
export function PopupView(): React.ReactElement {
	// Set of features supported by the Devtools. true is devtools found, false not found and undefined means still looking
	const [foundDevtools, setFoundDevtools] = React.useState<boolean | undefined>();

	React.useEffect(() => {
		if (window === undefined) {
			throw new Error("Window object is not defined.");
		}

		function handleMessage(event: MessageEvent<ISourcedDevtoolsMessage>): void {
			console.debug("handler reached");
			console.log(event);
			if (
				isDevtoolsMessage(event.data) &&
				event.data?.type === DevtoolsFeatures.MessageType
			) {
				clearTimeout(responseTimeout);
				setFoundDevtools(true);
			}
		}
		window.addEventListener("message", handleMessage);

		window.postMessage(getSupportedFeaturesMessage, "*");

		const responseTimeout: NodeJS.Timeout = setTimeout(() => {
			setFoundDevtools(false);
		}, 2000);

		// console.debug(...)	window.postMessage(getSupportedFeaturesMessage, "*"); // message.source = devtoolsMessageSource

		// Cleanup listener on unmount
		return () => {
			window?.removeEventListener("message", handleMessage);
			clearTimeout(responseTimeout);
		};
	}, []);

	// foundDevtools:
	// undefined => Show spinner
	// true => Show confirmation that devtools is running + instructions for how to access the extension
	// false => Show notice that devtools aren't running + instructions for how to set them up + search again button
	return (
		<div>
			{foundDevtools === undefined && <div>Loading...</div>}
			{foundDevtools === true && <div>Devtools found!</div>}
			{foundDevtools === false && <div>Devtools not found.</div>}
		</div>
	);
}
