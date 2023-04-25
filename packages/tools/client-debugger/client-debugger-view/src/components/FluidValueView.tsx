/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { FluidObjectValueNode } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem } from "@fluentui/react-components/unstable";
import { RenderLabel } from "./RenderLabel";
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
		<TreeItem>
			<RenderLabel
				nodeKey={nodeKey}
				nodeTypeMetadata={node.typeMetadata}
				nodeValue={node.value}
			/>
		</TreeItem>
	);
}
