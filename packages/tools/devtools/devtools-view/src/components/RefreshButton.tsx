/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { Button, Tooltip } from "@fluentui/react-components";
import { ArrowSync24Regular } from "@fluentui/react-icons";
import { GetContainerList } from "@fluidframework/devtools-core/internal";
import { useLogger } from "../TelemetryUtils.js";
import { useMessageRelay } from "../MessageRelayContext.js";

/**
 * Message sent to the webpage to query for the full container list.
 */
const getContainerListMessage = GetContainerList.createMessage();

/**
 * A refresh button to retrieve the latest list of containers.
 */
export function RefreshButton(): React.ReactElement {
	const messageRelay = useMessageRelay();
	const usageLogger = useLogger();

	const transparentButtonStyle = {
		backgroundColor: "transparent",
		border: "none",
		cursor: "pointer",
	};

	function handleRefreshClick(): void {
		// Query for list of Containers
		messageRelay.postMessage(getContainerListMessage);
		usageLogger?.sendTelemetryEvent({ eventName: "ContainerRefreshButtonClicked" });
	}

	return (
		<Tooltip content="Refresh Containers list" relationship="label">
			<Button
				icon={<ArrowSync24Regular />}
				style={transparentButtonStyle}
				onClick={handleRefreshClick}
				aria-label="Refresh Containers list"
			></Button>
		</Tooltip>
	);
}
