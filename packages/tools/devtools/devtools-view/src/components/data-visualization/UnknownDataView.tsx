/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { type UnknownObjectNode } from "@fluid-experimental/devtools-core";

import { type DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link UnknownDataView} input props.
 */
export type UnknownDataViewProps = DataVisualizationTreeProps<UnknownObjectNode>;

/**
 * Render data with type VisualNodeKind.UnknownObjectNode and render its children.
 */
export function UnknownDataView(props: UnknownDataViewProps): React.ReactElement {
	const { label, node } = props;

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={<i>Unrecognized kind of data.</i>}
			metadata={metadata}
		/>
	);
	return <TreeItem header={header} />;
}
