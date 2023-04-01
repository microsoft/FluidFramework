/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { HasContainerId, FluidObjectNodeBase, VisualNodeBase } from "@fluid-tools/client-debugger";
import { Waiting } from "./Waiting";

/**
 * {@link UnknownDataView} input props
 */
export interface UnknownDataViewProps extends HasContainerId {
	containerId: string;
	node: FluidObjectNodeBase | VisualNodeBase;
}

/**
 * Displays visual summary trees for DDS_s within the container
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { containerId, node } = props;

	return (
		<Waiting
			label={`Waiting for container DDS data. Container ID: ${containerId}, Node: ${JSON.stringify(
				node,
			)}`}
		/>
	);
}
