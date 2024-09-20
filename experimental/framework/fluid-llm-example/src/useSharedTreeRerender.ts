import { Tree, TreeNode } from "@fluidframework/tree";

import { useEffect, useState } from "react";

/**
 * This hook listens for changes on a shared tree node and triggers a re-render when a change occurs.
 * @remarks TODO: Add more complexity to the re-render conditional logic.
 */
export function useSharedTreeRerender(props: {
	sharedTreeNode: TreeNode | null;
	logId?: string;
}) {
	const { sharedTreeNode } = props;

	const [forceReRender, setForceReRender] = useState<number>(0);

	useEffect(() => {
		if (sharedTreeNode === null) return;

		const treeNodeListenerStopFunctions: VoidFunction[] = [];

		const listenerStopFunction = Tree.on(sharedTreeNode, "nodeChanged", () => {
			console.log(`useSharedTreeRerender ${props.logId}: nodeChanged`);
		});

		const listenerStopFunction2 = Tree.on(sharedTreeNode, "treeChanged", () => {
			console.log(`useSharedTreeRerender ${props.logId}: treeChanged`);
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
