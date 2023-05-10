/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { FluidObjectValueNode } from "@fluid-experimental/devtools-core";

import { Tree } from "../utility-components";
import { DataVisalizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";

/**
 * {@link ValueView} input props.
 */
export type FluidValueViewProps = DataVisalizationTreeProps<FluidObjectValueNode>;

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node } = props;

	const header = (
		<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} nodeValue={node.value} />
	);

	return <Tree header={header} />;
}
