/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { FluidObjectValueNode, HasContainerKey } from "@fluid-experimental/devtools-core";
import { EditableValueView } from "./EditableValueView";

import { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeItem } from "./TreeItem";

/**
 * {@link ValueView} input props.
 */
export type FluidValueViewProps = DataVisualizationTreeProps<FluidObjectValueNode> &
	HasContainerKey;

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node, containerKey } = props;
	console.log(label);
	// const metadata = JSON.stringify(node.metadata);
	const header = (
		<>
			<EditableValueView containerKey={containerKey} node={node}></EditableValueView>
		</>
	);

	return <TreeItem header={header} />;
}
