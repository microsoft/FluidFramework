/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { Tree, TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";
import { ValueNodeBase } from "@fluid-tools/client-debugger";

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

	return (
		<Tree>
			<TreeItem>
				<TreeItemLayout>
					{" "}
					{`${node.metadata !== undefined ? `${node.metadata} : ` : ""}
						${node.nodeKind}
						${String(node.value)}`}{" "}
				</TreeItemLayout>
			</TreeItem>
		</Tree>
	);
}
