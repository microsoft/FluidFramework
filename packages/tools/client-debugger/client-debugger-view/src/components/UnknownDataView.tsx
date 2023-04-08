/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, UnknownObjectNode } from "@fluid-tools/client-debugger";
import {
	Stack,
	StackItem,
} from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownDataViewProps extends HasContainerId {
	node: UnknownObjectNode;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<Stack className="UnknownDataView">
			<StackItem>
				Encountered an unrecognized kind of data object: {node.nodeKind}, {containerId}
			</StackItem>
		</Stack>
	);
}
