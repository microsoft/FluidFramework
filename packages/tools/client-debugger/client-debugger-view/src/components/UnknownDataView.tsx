/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { UnknownObjectNode } from "@fluid-tools/client-debugger";
import { Stack, StackItem, IStackStyles } from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownDataViewProps {
	node: UnknownObjectNode;
}

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { node } = props;

	const stackStyles: IStackStyles = {
		root: {
			padding: "10px",
			background: "rgb(237, 235, 233)",
		},
	};

	return (
		<Stack className="UnknownDataView">
			<StackItem styles={stackStyles}>
				Encountered an unrecognized kind of data object: {node.nodeKind}{" "}
			</StackItem>
		</Stack>
	);
}
