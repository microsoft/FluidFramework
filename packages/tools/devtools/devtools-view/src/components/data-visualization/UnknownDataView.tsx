/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, UnknownObjectNode } from "@fluidframework/devtools-core";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link UnknownDataView} input props.
 */
export type UnknownDataViewProps = DataVisualizationTreeProps<UnknownObjectNode> & HasContainerKey;

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { label, node, containerKey } = props;

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader
			containerKey={containerKey}
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={<i>Unrecognized kind of data.</i>}
			metadata={metadata}
		/>
	);
	return <TreeItem header={header} />;
}
