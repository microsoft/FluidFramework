/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { TreeItemLayout } from "@fluentui/react-components/unstable";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
import { ChevronCircleRight12Regular } from "@fluentui/react-icons";

/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps {
	node: FluidObjectValueNode;
}

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { node } = props;

	return (
		<TreeItemLayout>
			<ChevronCircleRight12Regular />
			{`${node.fluidObjectId}
						${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind} : 
						${String(node.value)}`}
		</TreeItemLayout>
	);
}
