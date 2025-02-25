/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tree, TreeNode } from "fluid-framework";
import { useEffect, useState } from "react";

/**
 * This hook listens for changes on a shared tree node and triggers a re-render when a change occurs.
 * @remarks TODO: Add more complexity to the re-render conditional logic.
 */
export function useSharedTreeRerender(props: {
	sharedTreeNode: TreeNode | undefined;
	logId?: string;
}): number {
	const { sharedTreeNode, logId } = props;

	const [forceReRender, setForceReRender] = useState<number>(0);

	useEffect(() => {
		if (sharedTreeNode === undefined) return;

		const treeNodeListenerStopFunctions: VoidFunction[] = [];

		const listenerStopFunction = Tree.on(sharedTreeNode, "nodeChanged", () => {
			console.log(`useSharedTreeRerender ${logId}: nodeChanged`);
		});

		const listenerStopFunction2 = Tree.on(sharedTreeNode, "treeChanged", () => {
			console.log(`useSharedTreeRerender ${logId}: treeChanged`);
			setForceReRender((prevReRender) => prevReRender + 1);
		});

		treeNodeListenerStopFunctions.push(listenerStopFunction, listenerStopFunction2);

		// Clean up tree node listeners.
		return () => {
			for (const stopFunction of treeNodeListenerStopFunctions) {
				stopFunction();
			}
		};
	}, [sharedTreeNode]);

	return forceReRender;
}
