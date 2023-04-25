/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { ValueNodeBase } from "@fluid-tools/client-debugger";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem } from "@fluentui/react-components/unstable";
import { RenderLabel } from "./RenderLabel";

/**
 * {@link ValueView} input props.
 */
export interface ValueViewProps {
	label: string;
	node: ValueNodeBase;
}

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { label, node } = props;

	return (
		<TreeItem>
			<RenderLabel
				label={label}
				nodeTypeMetadata={node.typeMetadata}
				nodeValue={node.value}
			/>
		</TreeItem>
	);
}
