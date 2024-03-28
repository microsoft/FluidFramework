/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";
import { useContainerFeaturesContext } from "../../ContainerFeatureFlagHelper.js";
import { EditableView } from "./EditableView.js";
import { TreeHeader } from "./TreeHeader.js";
import { TreeItem } from "./TreeItem.js";
/**
 * Render data with type VisualNodeKind.FluidValueNode and render its children.
 *
 * @remarks {@link ContainerFeaturesContext} must be set in order to use this component.
 */
export function FluidValueView(props) {
	const { label, node, containerKey } = props;
	const { containerFeatureFlags } = useContainerFeaturesContext();
	const editingEnabled =
		containerFeatureFlags.containerDataEditing === true && node.editProps !== undefined;
	const header = React.createElement(
		React.Fragment,
		null,
		editingEnabled === true
			? React.createElement(EditableView, {
					label: label,
					containerKey: containerKey,
					node: node,
			  })
			: React.createElement(TreeHeader, {
					label: label,
					nodeTypeMetadata: node.typeMetadata,
					inlineValue: String(node.value),
					sharedTreeSchemaData: node.sharedTreeSchemaData,
			  }),
	);
	return React.createElement(TreeItem, { header: header });
}
//# sourceMappingURL=FluidValueView.js.map
