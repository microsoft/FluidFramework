/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectNodeBase, VisualNodeBase } from "@fluid-tools/client-debugger";
import { Waiting } from "./Waiting";
import { waitingLabels } from "./WaitingLabels";

/**
 * {@link UnknownDataView} input props
 */
export interface UnknownFluidObjectViewProps extends HasContainerId {
	node: FluidObjectNodeBase | VisualNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<Waiting
			label={`${waitingLabels.unkownFluidDataError}: ${containerId}, Node: ${JSON.stringify(
				node,
			)}`}
		/>
	);
}
