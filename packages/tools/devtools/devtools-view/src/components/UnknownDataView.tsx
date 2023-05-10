/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { UnknownObjectNode } from "@fluid-experimental/devtools-core";
// eslint-disable-next-line import/no-internal-modules
import { TreeItem } from "@fluentui/react-components/unstable";
import { TreeHeader } from "./TreeHeader";

/**
 * {@link UnknownDataView} input props.
 */
export interface UnknownDataViewProps {
	node: UnknownObjectNode;
}

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { node } = props;

	return (
		<TreeItem v-bind:leaf="true">
			<TreeHeader
				label="Fluid Data Object"
				nodeTypeMetadata={node.nodeKind}
				nodeValue="Not supported"
			/>
		</TreeItem>
	);
}
