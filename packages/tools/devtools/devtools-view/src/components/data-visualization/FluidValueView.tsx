/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import type { FluidObjectValueNode, HasContainerKey } from "@fluid-experimental/devtools-core";
import { useContainerFeaturesContext } from "../../ContainerFeatureFlagHelper";
import { EditableView } from "./EditableView";

import type { DataVisualizationTreeProps } from "./CommonInterfaces";
import { TreeItem } from "./TreeItem";
import { TreeHeader } from "./TreeHeader";

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
				/>
			)}
		</>
	);

	return <TreeItem header={header} />;
}
