/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { TreeItemLayout } from "@fluentui/react-components/unstable";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";

/**
 * {@link ValueView} input props.
 */
export interface FluidValueViewProps {
	nodeKey: string | undefined;
	node: FluidObjectValueNode;
}

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { nodeKey, node } = props;

	return (
		// style={{ marginLeft: "65px" }}
		<TreeItemLayout>{`${nodeKey}(${node.typeMetadata}): ${String(node.value)}`}</TreeItemLayout>
	);
}
