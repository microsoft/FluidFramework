/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	Box,
	Button,
	CircularProgress,
	Container,
	Stack,
	Tab,
	Tabs,
	Typography,
} from "@mui/material";
import type { IFluidContainer, TreeView } from "fluid-framework";
import React, { useEffect, useState } from "react";

import { TaskGroup } from "@/components/TaskGroup";
import {
	CONTAINER_SCHEMA,
	INITIAL_APP_STATE,
	SharedTreeAppState,
	TREE_CONFIGURATION,
	type SharedTreeTaskGroup,
} from "@/types/sharedTreeAppSchema";
import { useFluidContainerNextJs } from "@/useFluidContainerNextjs";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";

// Uncomment the import line that corresponds to the server you want to use
// import { createContainer, loadContainer, postAttach, containerIdFromUrl } from "./spe"; // eslint-disable-line import/order
import { createContainer, loadContainer, postAttach, containerIdFromUrl } from "./tinylicious"; // eslint-disable-line import/order

export async function createAndInitializeContainer(): Promise<
	IFluidContainer<typeof CONTAINER_SCHEMA>
> {
	const container = await createContainer(CONTAINER_SCHEMA);
	const treeView = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
	treeView.initialize(new SharedTreeAppState(INITIAL_APP_STATE));
	treeView.dispose(); // After initializing, dispose the tree view so later loading of the data can work correctly
	return container;
}

// eslint-disable-next-line import/no-default-export -- NextJS uses default exports
export default function TasksListPage(): JSX.Element {
	const [selectedTaskGroup, setSelectedTaskGroup] = useState<SharedTreeTaskGroup>();
	const [treeView, setTreeView] = useState<TreeView<typeof SharedTreeAppState>>();

	const { container, isFluidInitialized, data } = useFluidContainerNextJs(
		containerIdFromUrl(),
		createAndInitializeContainer,
		postAttach,
		async (id) => loadContainer(CONTAINER_SCHEMA, id),
		// Get data from existing container
		(fluidContainer) => {
			const _treeView = fluidContainer.initialObjects.appState.viewWith(TREE_CONFIGURATION);
			setTreeView(_treeView);
			return { sharedTree: _treeView };
		},
	);

	const taskGroups = data?.sharedTree.root.taskGroups;
	useSharedTreeRerender({ sharedTreeNode: taskGroups, logId: "WorkItemRoot" });

	useEffect(() => {
		if (
			isFluidInitialized === true &&
			data !== undefined &&
			data.sharedTree.root.taskGroups.length > 0
		) {
			setSelectedTaskGroup(data.sharedTree.root.taskGroups[0]);
		}
	}, [container, data, isFluidInitialized]);

	return (
		<Container
			sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
			maxWidth={false}
		>
			<Typography variant="h2" sx={{ my: 3 }}>
				My Work Items
			</Typography>

			{isFluidInitialized === false && <CircularProgress />}

			{isFluidInitialized === true &&
				treeView !== undefined &&
				taskGroups !== undefined &&
				selectedTaskGroup !== undefined && (
					<React.Fragment>
						<Stack direction="row" spacing={2} alignItems="center">
							<Box sx={{ borderBottom: 1, borderColor: "divider" }}>
								<Tabs
									value={selectedTaskGroup.id}
									sx={{ mb: 2 }}
									aria-label="basic tabs example"
									onChange={(e, newSelectedTaskGroupId) => {
										const foundTaskGroup = taskGroups.find(
											(taskGroup) => taskGroup.id === newSelectedTaskGroupId,
										);
										setSelectedTaskGroup(foundTaskGroup);
									}}
								>
									{taskGroups?.map((taskGroup) => (
										<Tab label={taskGroup.title} value={taskGroup.id} key={taskGroup.id} />
									))}
								</Tabs>
							</Box>

							<Button
								variant="contained"
								size="small"
								color="success"
								onClick={() => taskGroups.insertAtEnd(getNewTaskGroup(taskGroups.length))}
							>
								New Group
							</Button>
						</Stack>

						<TaskGroup treeView={treeView} sharedTreeTaskGroup={selectedTaskGroup} />
					</React.Fragment>
				)}
		</Container>
	);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- Too repetitive to do it
const getNewTaskGroup = (groupLength: number) => {
	return {
		title: `New Task Group ${groupLength}`,
		description: "New task group description",
		tasks: [
			{
				assignee: "Alice",
				title: "Task #1",
				description:
					"This is the first task. Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
				priority: "low",
				complexity: 1,
				status: "todo",
			},
			{
				assignee: "Bob",
				title: "Task #2",
				description:
					"This is the second task.  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
				priority: "medium",
				complexity: 2,
				status: "in-progress",
			},
			{
				assignee: "Charlie",
				title: "Task #3",
				description:
					"This is the third task!  Blah Blah blah Blah Blah blahBlah Blah blahBlah Blah blahBlah Blah blah",
				priority: "high",
				complexity: 3,
				status: "done",
			},
		],
		engineers: [
			{
				name: "Alice",
				maxCapacity: 15,
				skills: "Senior engineer capable of handling complex tasks. Versed in most languages",
			},
			{
				name: "Bob",
				maxCapacity: 12,
				skills:
					"Mid-level engineer capable of handling medium complexity tasks. Versed in React, Node.JS",
			},
			{
				name: "Charlie",
				maxCapacity: 7,
				skills: "Junior engineer capable of handling simple tasks. Versed in Node.JS",
			},
		],
	};
};
