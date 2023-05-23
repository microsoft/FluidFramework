/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { FluidObjectValueNode } from "@fluid-experimental/devtools-core";

import { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link ValueView} input props.
 */
export type FluidValueViewProps = DataVisualizationTreeProps<FluidObjectValueNode>;

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node } = props;

	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={String(node.value)}
		/>
	);

	return <TreeItem header={header} />;
}
