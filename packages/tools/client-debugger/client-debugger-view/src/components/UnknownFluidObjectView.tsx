/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidUnknownObjectNode } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { TreeItemLayout } from "@fluentui/react-components/unstable";

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
		<TreeItemLayout>
			{`Encountered an unrecognized kind of Fluid object: ${node.nodeKind}`}
		</TreeItemLayout>
	);
}
