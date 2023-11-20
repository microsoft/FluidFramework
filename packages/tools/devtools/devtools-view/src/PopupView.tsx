/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { type DevtoolsFeatureFlags, GetDevtoolsFeatures } from "@fluid-experimental/devtools-core";

const getSupportedFeaturesMessage = GetDevtoolsFeatures.createMessage();

/**
 * Renders a popup element when the user clicks on the extension w into the provided target element.
 * @public
 */
export function PopupView(): React.ReactElement {
	const [supportedFeatures, setSupportedFeatures] = React.useState<
		DevtoolsFeatureFlags | undefined
	>();
	if (window === undefined) {
		throw new Error("Window object is not defined.");
	}

	React.useEffect(() => {
		function handleMessage(event: MessageEvent) {
			// Ensure the message is the type we're expecting
			if (
				event.source === window &&
				event.data &&
				event.data.type === GetDevtoolsFeatures.MessageType
			) {
				setSupportedFeatures(event.data.features);
			}
		}
		window.addEventListener("message", handleMessage);

		// Post message to content script
		window.postMessage(getSupportedFeaturesMessage, "*");

		// Cleanup listener on unmount
		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, [setSupportedFeatures]);
	return (
		<div>
			To use the Fluid Devtools, open the browser Devtools pane (F12) and click the `Fluid
			Developer Tools` tab. {supportedFeatures}
		</div>
	);
}
