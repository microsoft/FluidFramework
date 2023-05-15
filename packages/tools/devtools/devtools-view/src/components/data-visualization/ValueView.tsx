/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { ValueNodeBase } from "@fluid-experimental/devtools-core";

import { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeHeader } from "./TreeHeader";
import { TreeItem } from "./TreeItem";

/**
 * {@link ValueView} input props.
 */
export type ValueViewProps = DataVisualizationTreeProps<ValueNodeBase>;

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { label, node } = props;

	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={String(node.value)}
		/>
	);
	return <TreeItem header={header} />;
}
