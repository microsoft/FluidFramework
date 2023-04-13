/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { UnknownObjectNode } from "@fluid-tools/client-debugger";
import { Stack, StackItem } from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownDataViewProps {
	node: UnknownObjectNode;
}

/**
 * Render data with type {@link VisualNodeKind.UnknownObjectNode}.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { node } = props;

	return (
		<Stack className="UnknownDataView">
			<StackItem>Encountered an unrecognized kind of data object: {node.nodeKind} </StackItem>
		</Stack>
	);
}
