/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidUnknownObjectNode } from "@fluid-experimental/devtools-core";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem } from "@fluentui/react-components/unstable";
import { TreeHeader } from "./TreeHeader";

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

	return (
		<TreeItem v-bind:leaf="true">
			<TreeHeader
				label="Fluid Object"
				nodeTypeMetadata={node.nodeKind}
				nodeValue="Not supported"
			/>
		</TreeItem>
	);
}
