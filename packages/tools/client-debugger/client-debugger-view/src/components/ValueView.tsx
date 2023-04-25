/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { ValueNodeBase } from "@fluid-tools/client-debugger";
import { RenderLabel } from "./RenderLabel";

/**
 * {@link ValueView} input props.
 */
export interface ValueViewProps {
	nodeKey: string | undefined;
	node: ValueNodeBase;
}

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { nodeKey, node } = props;

	return (
		<RenderLabel
			nodeKey={nodeKey}
			nodeTypeMetadata={node.typeMetadata}
			nodeValue={node.value}
		/>
	);
}
