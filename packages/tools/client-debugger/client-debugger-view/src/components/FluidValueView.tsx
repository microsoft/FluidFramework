/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem } from "@fluentui/react-components/unstable";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
import { TreeHeader } from "./TreeHeader";
import { HasLabel } from "./CommonInterfaces";

/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps extends HasLabel {
	node: FluidObjectValueNode;
}

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node } = props;

	return (
		// TODO: Remove TreeItem
		<TreeItem>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} nodeValue={node.value} />
		</TreeItem>
	);
}
