/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

'use client';

import { useFluidContainer } from "@/useFluidContainer";
import { SharedTreeAppState, INITIAL_APP_STATE, CONTAINER_SCHEMA, TREE_CONFIGURATION, type SharedTreeTaskList, type SharedTreeTaskGroup, type SharedTreeTaskGroupList } from "@/types/sharedTreeAppSchema";
import { Box, Button, Card, CircularProgress, Container, Divider, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useSearchParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { TaskCard } from "@/components/TaskCard";
import { TaskGroup } from "@/components/TaskGroup";
import { Tree } from "@fluidframework/tree";



export default function TasksListPage() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [taskGroups, setTaskGroups] = useState<SharedTreeTaskGroupList>();
	const [selectedTaskGroup, setSelectedTaskGroup] = useState<SharedTreeTaskGroup>();

	const { container, containerId, isFluidInitialized, data } = useFluidContainer(
		CONTAINER_SCHEMA,
		searchParams.get('fluidContainerId'),
		// initialize from new container
		(container) => {
			const sharedTree = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
			sharedTree.initialize(new SharedTreeAppState(INITIAL_APP_STATE));
			return { sharedTree };
		},
		// initialize from existing container
		(container) => {
			const sharedTree = container.initialObjects.appState.viewWith(TREE_CONFIGURATION);
			return { sharedTree };
		}
	);

	useEffect(() => {
		if (isFluidInitialized === true && containerId !== undefined) {
			router.replace(`${window.location}?fluidContainerId=${containerId}`);
		}
	}, [containerId]);


	const [forceReRender, setForceReRender] = useState<number>(0);
	useEffect(() => {
		if (isFluidInitialized === true && data !== undefined) {
			setTaskGroups(data.sharedTree.root.taskGroups);
			if (data.sharedTree.root.taskGroups.length > 0) {
				setSelectedTaskGroup(data.sharedTree.root.taskGroups[0]);
			}

			const listenerStopFunction = Tree.on(data.sharedTree.root.taskGroups, "treeChanged", () => {
				console.log('RootView: treeChanged');
				setForceReRender(prevReRender => { return prevReRender + 1; });
			});

			// Clean up tree node listeners.
			return () => {
				listenerStopFunction();
			};
		}
	}, [container]);

	return (
		<Container sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }} maxWidth={'lg'}>
			<Typography variant="h2" sx={{ my: 3 }}>
				My Work Items
			</Typography>

			{isFluidInitialized === false && <CircularProgress />}

			{isFluidInitialized === true && taskGroups !== undefined && selectedTaskGroup !== undefined && <React.Fragment>

				<Stack direction='row' spacing={2} alignItems='center' >
					<Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
						<Tabs value={selectedTaskGroup.id} sx={{ mb: 2 }} aria-label="basic tabs example"
							onChange={(e, newSelectedTaskGroupId) => {
								const foundTaskGroup = taskGroups.find((taskGroup) => taskGroup.id === newSelectedTaskGroupId);
								setSelectedTaskGroup(foundTaskGroup);
							}}
						>
							{taskGroups?.map(taskGroup => <Tab label={taskGroup.title} value={taskGroup.id} />)}
						</Tabs>
					</Box>

					<Button variant='contained' size='small' color='success'
						onClick={() => taskGroups.insertAtEnd(getNewTaskGroup(taskGroups.length))}
					>
						New Group
					</Button>
				</Stack>

				<TaskGroup sharedTreeTaskGroup={selectedTaskGroup} />
			</React.Fragment>
			}
		</Container >
	);
}

export const getNewTaskGroup = (groupLength: number) => {
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
				skills:
					"Senior engineer capable of handling complex tasks. Versed in most languages",
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
}
