/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	SharedTreeAppState,
	INITIAL_APP_STATE,
	CONTAINER_SCHEMA,
	TREE_CONFIGURATION,
	type SharedTreeTaskGroup,
} from "@/types/sharedTreeAppSchema";
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
import React, { useEffect, useState } from "react";
import { TaskGroup } from "@/components/TaskGroup";
import { type TreeView } from "@fluidframework/tree";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";
import { useFluidContainerNextJs } from "@/useFluidContainerNextjs";
import { start } from "@/infra/authHelper";
import type { IFluidContainer } from "@fluidframework/fluid-static";

const { client, getShareLink, containerId } = await start();

async function loadContainer(
	id: string,
): Promise<IFluidContainer<typeof CONTAINER_SCHEMA>> {
	console.log(`Loading container with id '${id}'`);
	const res = await client.getContainer(id, CONTAINER_SCHEMA);
	return res.container;
}

export async function createAndInitializeContainer(): Promise<IFluidContainer<typeof CONTAINER_SCHEMA>> {
	console.log("Creating a new container");

	const { container } = await client.createContainer(CONTAINER_SCHEMA);
	const treeView = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
	treeView.initialize(new SharedTreeAppState(INITIAL_APP_STATE));
	treeView.dispose(); // After initializing, dispose the tree view so later loading of the data can work correctly
	return container;
}

async function postAttach(containerId: string, container: IFluidContainer<typeof CONTAINER_SCHEMA>) {
	// Create a sharing id to the container and set it in the URL hash.
	// This allows the user to collaborate on the same Fluid container with other users just by sharing the link.
	const shareId = await getShareLink(containerId);
	history.replaceState(undefined, "", "#" + shareId);
}

export default function TasksListPage() {
	const [selectedTaskGroup, setSelectedTaskGroup] = useState<SharedTreeTaskGroup>();
	const [sharedTreeBranch, setSharedTreeBranch] =
		useState<TreeView<typeof SharedTreeAppState>>();

	const { container, isFluidInitialized, data } = useFluidContainerNextJs(
		containerId,
		createAndInitializeContainer,
		postAttach,
		loadContainer,
		// Get data from existing container
		(container) => {
			const treeView = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
			setSharedTreeBranch(treeView);
			return { sharedTree: treeView };
		},
	);

	const taskGroups = data?.sharedTree.root.taskGroups;
	useSharedTreeRerender({ sharedTreeNode: taskGroups ?? null, logId: "WorkItemRoot" });

	useEffect(() => {
		if (isFluidInitialized === true && data !== undefined) {
			// initialize the selected task group
			if (data.sharedTree.root.taskGroups.length > 0) {
				setSelectedTaskGroup(data.sharedTree.root.taskGroups[0]);
			}
		}
	}, [container]);

	return (
		<Container
			sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
			maxWidth={"lg"}
		>
			<Typography variant="h2" sx={{ my: 3 }}>
				My Work Items
			</Typography>

			{isFluidInitialized === false && <CircularProgress />}

			{isFluidInitialized === true &&
				sharedTreeBranch !== undefined &&
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

						<TaskGroup
							sharedTreeBranch={sharedTreeBranch}
							sharedTreeTaskGroup={selectedTaskGroup}
						/>
					</React.Fragment>
				)}
		</Container>
	);
}

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
