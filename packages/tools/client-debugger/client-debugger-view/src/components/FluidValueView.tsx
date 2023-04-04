/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectValueNode } from "@fluid-tools/client-debugger";

/**
 * {@link ValueView} input props
 */
export interface FluidValueViewProps extends HasContainerId {
	node: FluidObjectValueNode;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<>
			{`containerId: ${containerId}, fluidObjectId: ${
				node.fluidObjectId
			}, value: ${JSON.stringify(node.value)}`}
		</>
	);
}
