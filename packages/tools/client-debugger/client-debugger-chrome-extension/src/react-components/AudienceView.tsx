/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { HasContainerId } from "@fluid-tools/client-debugger";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

/**
 * {@link AudienceView} input props.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AudienceViewProps extends HasContainerId {
	// TODO
}

/**
 * Displays information about the provided {@link @fluidframework/fluid-static#IServiceAudience | audience}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
	const { containerId } = props;

	// TODO: Post message requesting Audience summary
	// TODO: Listen for Audience data updates

	React.useEffect(() => {
		// TODO
	}, [containerId]);

	return (
		<Stack>
			<StackItem>
				<h3>Audience Data</h3>
			</StackItem>
			<StackItem>
				<div>TODO</div>
			</StackItem>
		</Stack>
	);
}
