/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidUnknownObjectNode } from "@fluid-tools/client-debugger";
import { Stack, StackItem, IStackStyles } from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownFluidObjectViewProps {
	node: FluidUnknownObjectNode;
}

/**
 * Render data with type VisualNodeKind.FluidUnknownObjectNode and render its children.
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { node } = props;

	const stackStyles: IStackStyles = {
		root: {
			padding: "10px",
			background: "rgb(237, 235, 233)",
		},
	};

	return (
		<Stack className="UnknownFluidObjectView">
			<StackItem styles={stackStyles}>
				Encountered an unrecognized kind of Fluid object: {node.nodeKind},{" "}
				{node.fluidObjectId}
			</StackItem>
		</Stack>
	);
}
