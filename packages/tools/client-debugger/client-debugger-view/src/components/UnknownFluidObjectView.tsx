/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidUnknownObjectNode } from "@fluid-tools/client-debugger";
// import { Waiting } from "./Waiting";
// import { waitingLabels } from "./WaitingLabels";

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

	return (
		<>
			<h1> Unknown Data Object </h1>
			{containerId}
			{node.fluidObjectId}
		</>
		// 	label={`${waitingLabels.unkownFluidDataError}: ${containerId}, ${
		// 		node.fluidObjectId
		// 	} Node: ${JSON.stringify(node)}`}
		// />
	);
}
