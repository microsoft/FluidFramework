/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
import { RenderLabel } from "./RenderLabel";
/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps {
	label: string;
	node: FluidObjectValueNode;
}

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node } = props;

	return (
		<RenderLabel label={label} nodeTypeMetadata={node.typeMetadata} nodeValue={node.value} />
	);
}
