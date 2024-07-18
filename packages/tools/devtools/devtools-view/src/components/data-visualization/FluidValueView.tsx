/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidObjectValueNode,
	HasContainerKey,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useContainerFeaturesContext } from "../../ContainerFeatureFlagHelper.js";

import type { DataVisualizationTreeProps } from "./CommonInterfaces.js";
import { EditableView } from "./EditableView.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";

/**
 * {@link ValueView} input props.
 */
export type FluidValueViewProps = DataVisualizationTreeProps<FluidObjectValueNode> &
	HasContainerKey &
	HasContainerKey;

/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 *
 * @remarks {@link ContainerFeaturesContext} must be set in order to use this component.
 */
export function FluidValueView(props: FluidValueViewProps): React.ReactElement {
	const { label, node, containerKey } = props;
	const { containerFeatureFlags } = useContainerFeaturesContext();
	const editingEnabled =
		containerFeatureFlags.containerDataEditing === true && node.editProps !== undefined;
	const header = (
		<>
			{editingEnabled === true ? (
				<EditableView label={label} containerKey={containerKey} node={node} />
			) : (
				<TreeHeader
					label={label}
					nodeTypeMetadata={node.typeMetadata}
					inlineValue={String(node.value)}
					tooltipContents={node.tooltipContents}
				/>
			)}
		</>
	);

	return <TreeItem header={header} />;
}
