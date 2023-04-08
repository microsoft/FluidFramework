/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidUnknownObjectNode } from "@fluid-tools/client-debugger";
import {
	Stack,
	StackItem,
} from "@fluentui/react";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownFluidObjectViewProps extends HasContainerId {
	node: FluidUnknownObjectNode;
}

/**
 * Displays visual summary trees for DDS_s within the container.
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { containerId, node } = props;

	console.log(containerId, node); 
	
	return (
		<Stack className="UnknownFluidObjectView">
			<StackItem>
				Encountered an unrecognized kind of Fluid object: {node.fluidObjectId}
			</StackItem>
		</Stack>
	);
}
