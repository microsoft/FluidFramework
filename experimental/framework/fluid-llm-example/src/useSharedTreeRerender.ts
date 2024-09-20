import { Tree, TreeNode } from "@fluidframework/tree";

import { useEffect, useState } from "react";

export function useSharedTreeRerender(sharedTreeNode: TreeNode | null) {
	const [forceReRender, setForceReRender] = useState<number>(0);

	useEffect(() => {
		if (sharedTreeNode === null) return;

		const treeNodeListenerStopFunctions: VoidFunction[] = [];

		const listenerStopFunction = Tree.on(sharedTreeNode, "nodeChanged", () => {
			console.log("TaskGroup: nodeChanged");
		});

		const listenerStopFunction2 = Tree.on(sharedTreeNode, "treeChanged", () => {
			console.log("TaskGroup: treeChanged");
			setForceReRender((prevReRender) => prevReRender + 1);
		});

		treeNodeListenerStopFunctions.push(listenerStopFunction, listenerStopFunction2);

		// Clean up tree node listeners.
		return () => {
			treeNodeListenerStopFunctions.forEach((stopFunction) => stopFunction());
		};
	}, [sharedTreeNode]);

	return forceReRender;
}
