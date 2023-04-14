/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
import { Stack, StackItem, IStackStyles } from "@fluentui/react";

/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps {
	node: FluidObjectValueNode;
}

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { node } = props;
	const stackStyles: IStackStyles = {
		root: {
			padding: "15px",
			background: "rgb(237, 235, 233)",
		},
	};

	return (
		<Stack>
			<StackItem styles={stackStyles}>
				{`${node.fluidObjectId}
						${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind} : 
						${String(node.value)}`}
			</StackItem>
		</Stack>
	);
}
