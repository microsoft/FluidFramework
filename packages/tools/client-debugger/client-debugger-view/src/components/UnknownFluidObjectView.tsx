/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidUnknownObjectNode } from "@fluid-tools/client-debugger";
import { Stack, StackItem } from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownFluidObjectViewProps {
	node: FluidUnknownObjectNode;
}

/**
 * Render data with type {@link VisualNodeKind.FluidUnknownObjectNode}.
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { node } = props;

	return (
		<Stack className="UnknownFluidObjectView">
			<StackItem>
				Encountered an unrecognized kind of Fluid object: {node.nodeKind},{" "}
				{node.fluidObjectId}
			</StackItem>
		</Stack>
	);
}
