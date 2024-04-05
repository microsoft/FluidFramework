/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidUnknownObjectNode,
	HasContainerKey,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link UnknownFluidObjectView} input props.
 */
export type UnknownFluidObjectViewProps = DataVisualizationTreeProps<FluidUnknownObjectNode> &
	HasContainerKey;

/**
 * Render data with type VisualNodeKind.FluidUnknownObjectNode and render its children.
 */
export function UnknownFluidObjectView(props: UnknownFluidObjectViewProps): React.ReactElement {
	const { containerKey, label, node } = props;

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader
			containerKey={containerKey}
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={<i>Unrecognized kind of Fluid Object.</i>}
			metadata={metadata}
		/>
	);
	return <TreeItem header={header} />;
}
