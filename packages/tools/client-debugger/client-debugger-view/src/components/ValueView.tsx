/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem, TreeItemLayout } from "@fluentui/react-components/unstable";
import { ValueNodeBase } from "@fluid-tools/client-debugger";

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
		<TreeItem>
			<TreeItemLayout>{`${nodeKey}(${node.typeMetadata}): ${String(
				node.value,
			)}`}</TreeItemLayout>
		</TreeItem>
	);
}
