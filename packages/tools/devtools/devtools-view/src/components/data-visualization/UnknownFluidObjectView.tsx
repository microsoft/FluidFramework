/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { FluidUnknownObjectNode } from "@fluid-experimental/devtools-core";

import { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link UnknownFluidObjectView} input props.
 */
export type UnknownFluidObjectViewProps = DataVisualizationTreeProps<FluidUnknownObjectNode>;

/**
 * Render data with type VisualNodeKind.FluidUnknownObjectNode and render its children.
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { label, node } = props;

	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={<i>Unrecognized kind of Fluid Object.</i>}
		/>
	);
	return <TreeItem header={header} />;
}
