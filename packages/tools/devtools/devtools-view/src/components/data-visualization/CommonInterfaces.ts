/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type VisualNode, type VisualNodeBase } from "@fluid-experimental/devtools-core";
import { type Serializable } from "@fluidframework/datastore-definitions";

/**
 * Base interface used in passing key of the child node from Record {@link VisualTree}.
 */
export interface HasLabel {
	/**
	 * Label to accompany the data being displayed.
	 *
	 * @remarks
	 *
	 * This will commonly be the property name, map key, etc. under which the data was stored in the
	 * corresponding application's data model.
	 */
	label: string;
}

/**
 * Base props interface for components displaying {@link @fluid-experimental/devtools-core#VisualTreeNode}s.
 */
export interface DataVisualizationTreeProps<TNode extends VisualNodeBase = VisualNode>
	extends HasLabel {
	/**
	 * The visual data to be displayed.
	 */
	node: TNode;
}

/**
 * TODO
 */
export interface CanSupplyEdit {
	edit<T>(newValue: Serializable<T>);
}
