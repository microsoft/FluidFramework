/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { HasContainerKey, ValueNodeBase } from "@fluidframework/devtools-core";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link ValueView} input props.
 */
export type ValueViewProps = DataVisualizationTreeProps<ValueNodeBase> & HasContainerKey;

/**
 * Render data with type VisualNodeKind.ValueNode and render its children.
 */
export function ValueView(props: ValueViewProps): React.ReactElement {
	const { label, node, containerKey } = props;

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader
			containerKey={containerKey}
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={String(node.value)}
			tooltipContents={node.tooltipContents}
			metadata={metadata}
		/>
	);
	return <TreeItem header={header} />;
}
