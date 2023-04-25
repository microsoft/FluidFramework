/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedTreeView } from "@fluid-experimental/tree2";
import React from "react";

/**
 * Returns the root of the given ISharedTree instance.  The returned object tree may
 * be mutated and passed as properties to subcomponents.
 *
 * Be aware that object retained between render passes will mutate.  Use deep clone
 * if saving a copy for comparison.
 *
 * Not currently compatible with 'React.memo'.
 */
export function useTree<T>(tree: ISharedTreeView): T {
	// This proof-of-concept implementation allocates a state variable this is modified
	// when the tree changes to trigger re-render.
	const [invalidations, setInvalidations] = React.useState(0);

	// Register for tree deltas when the component mounts
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return tree.events.on("afterBatch", () => {
			setInvalidations(invalidations + 1);
		});
	});

	return tree.root as unknown as T;
}
