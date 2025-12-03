/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidUnknownObjectNode } from "@fluidframework/devtools-core/internal";
import React from "react";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link UnknownFluidObjectView} input props.
 */
export type UnknownFluidObjectViewProps = DataVisualizationTreeProps<FluidUnknownObjectNode>;

/**
 * Render data with type VisualNodeKind.FluidUnknownObjectNode and render its children.
 */
export function UnknownFluidObjectView(
	props: UnknownFluidObjectViewProps,
): React.ReactElement {
	const { label, node } = props;

	const metadata = JSON.stringify(node.metadata);
	const header = (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={<i>Unrecognized kind of Fluid Object.</i>}
			metadata={metadata}
		/>
	);
	return <TreeItem header={header} />;
}
