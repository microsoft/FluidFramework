/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { ValueNodeBase } from "@fluid-tools/client-debugger";
import { Stack, StackItem, IStackStyles } from "@fluentui/react";

/**
 * {@link ValueView} input props.
 */
export interface ValueViewProps {
	node: ValueNodeBase;
}

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { node } = props;

	const stackStyles: IStackStyles = {
		root: {
			padding: "10px",
			background: "rgb(237, 235, 233)",
		},
	};

	return (
		<Stack>
			<StackItem styles={stackStyles}>
				{`${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind}
						${String(node.value)}`}
			</StackItem>
		</Stack>
	);
}
