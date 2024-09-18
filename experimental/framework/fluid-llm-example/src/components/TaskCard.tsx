'use client';

import { editTask } from "@/actions/task";
import { SharedTreeEngineerList, SharedTreeTask, SharedTreeTaskGroup } from "@/types/sharedTreeAppSchema";
import { TaskPriorities, TaskStatuses, type Task, type TaskPriority } from "@/types/task";
import { Tree } from "@fluidframework/tree";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Box, Button, Card, CircularProgress, Divider, FormControl, IconButton, InputLabel, MenuItem, Popover, Select, Stack, TextField, Typography } from "@mui/material";
import { LoadingButton } from '@mui/lab';
import { useEffect, useState } from "react";

export function TaskCard(props: { sharedTreeTaskGroup: SharedTreeTaskGroup, sharedTreeTask: SharedTreeTask, engineers: SharedTreeEngineerList }) {

	const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | null>(null);

	const [engineers, setEngineers] = useState<SharedTreeEngineerList>(props.engineers);

	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);

	const [forceReRender, setForceReRender] = useState<number>(0);
	useEffect(() => {
		const treeNodeListenerStopFunctions: VoidFunction[] = [];

		const listenerStopFunction = Tree.on(props.sharedTreeTask, "nodeChanged", () => {
			setForceReRender(prevReRender => { return prevReRender + 1; });
		});

		treeNodeListenerStopFunctions.push(listenerStopFunction);

		// Clean up tree node listeners.
		return () => {
			treeNodeListenerStopFunctions.forEach(stopFunction => stopFunction());
		};
	}, []);

	const deleteTask = () => {
		const taskIndex = props.sharedTreeTaskGroup.tasks.indexOf(props.sharedTreeTask);
		console.log('initiated delete of task at index: ', taskIndex);
		props.sharedTreeTaskGroup.tasks.removeAt(taskIndex);
	};

	const task = props.sharedTreeTask;

	return <Card sx={{
		p: 4, position: 'relative', width: '100%',


	}} key={`${task.title}`}>

		<Box component='span' sx={{ position: 'absolute', top: 0, right: 0 }}>
			<IconButton onClick={() => deleteTask()}>
				<Icon icon='zondicons:close-solid' width={20} height={20} />
			</IconButton>
		</Box>

		<Box mb={2}>
			<Stack direction='row' justifyContent='space-between' alignItems='center'>
				<Box>
					<Typography variant='h1' fontSize={24}>{task.title}</Typography>
					<Divider sx={{ fontSize: 12 }} />
				</Box>
				<Box>
					<Popover
						open={Boolean(popoverAnchor)}
						anchorEl={popoverAnchor}
						onClose={() => setPopoverAnchor(null)}
						anchorOrigin={{
							vertical: 'top',
							horizontal: 'center',
						}}
						transformOrigin={{
							vertical: 'bottom',
							horizontal: 'center',
						}}
					>
						<Box
							component="form"
							sx={{ display: 'flex', width: '500px', alignItems: 'center', p: 2 }}
							onSubmit={async (e) => {
								e.preventDefault();
								const formData = new FormData(e.currentTarget);
								const query = formData.get('searchQuery') as string;
								console.log('evoking server action w/ query: ', query);
								setIsAiTaskRunning(true);
								const resp = await editTask({ ...task } as Task, query);
								setIsAiTaskRunning(false);
								if (resp.success) {
									// We don't know what exactly changed, So we just update everything.
									props.sharedTreeTask.description = resp.data.description;
									props.sharedTreeTask.priority = resp.data.priority;
									props.sharedTreeTask.status = resp.data.status
								}
							}}
						>
							<TextField
								id="search-bar"
								name="searchQuery"
								label="Ask AI For Help"
								variant="outlined"
								size="small"
								sx={{ flexGrow: 1, marginRight: 1 }}
							/>

							<LoadingButton loading={isAiTaskRunning} type="submit" variant="contained" color="primary">
								Send
							</LoadingButton>
						</Box>
					</Popover>
					<Button
						size='small'
						variant='contained'
						color="primary"
						sx={{ minWidth: '40px', padding: '4px' }}
						onClick={(event) => setPopoverAnchor(event.currentTarget)}
					>
						<Icon icon='octicon:copilot-16' width={20} height={20} />
					</Button>
				</Box>
			</Stack>
		</Box>

		<Stack direction='row' sx={{ width: '100%' }} spacing={2}>
			<Stack sx={{ flexGrow: 1 }}>
				<TextField
					id="input-description-label-id"
					label='Description'
					value={task.description}
					onChange={(e) => props.sharedTreeTask.description = e.target.value}
					sx={{ height: '100%' }}
					slotProps={{
						input: {
							multiline: true,
							sx: { alignItems: 'flex-start' }
						},
						inputLabel: {
							sx: { fontWeight: 'bold' }
						}
					}}
				/>
			</Stack>

			<Stack spacing={1} minWidth={180}>
				<Stack direction='row' spacing={1} alignItems='center'>

					<FormControl fullWidth>
						<InputLabel id="select-priority-label-id">
							<Typography fontWeight='bold'>
								Priority
							</Typography>
						</InputLabel>
						<Select
							labelId="select-priority-label-id"
							id="select-priority-id"
							value={task.priority}
							label="Priority"
							onChange={(e) => {
								props.sharedTreeTask.priority = e.target.value as TaskPriority;
							}}
							size="small"
						>
							<MenuItem value={TaskPriorities.LOW} key={TaskPriorities.LOW}>
								<Typography color='blue'> Low </Typography>
							</MenuItem>
							<MenuItem value={TaskPriorities.MEDIUM} color='orange' key={TaskPriorities.MEDIUM}>
								<Typography color='orange'> Medium </Typography>
							</MenuItem>
							<MenuItem value={TaskPriorities.HIGH} color='red' key={TaskPriorities.HIGH}>
								<Typography color='red'> High </Typography>
							</MenuItem>
						</Select>
					</FormControl>

				</Stack>

				<Stack direction='row' spacing={1} alignItems='center'>

					<FormControl fullWidth>
						<InputLabel id="select-status-label-id">
							<Typography fontWeight='bold'>
								Status
							</Typography>
						</InputLabel>
						<Select
							labelId="select-status-label-id"
							id="select-status-id"
							value={task.status}
							label="Status"
							onChange={(e) => props.sharedTreeTask.status = e.target.value}
							size="small"
						>
							<MenuItem value={TaskStatuses.TODO} key={TaskStatuses.TODO}>
								<Typography> Todo </Typography>
							</MenuItem>
							<MenuItem value={TaskStatuses.IN_PROGRESS} color='orange' key={TaskStatuses.IN_PROGRESS}>
								<Typography color='blue'> In Progress </Typography>
							</MenuItem>
							<MenuItem value={TaskStatuses.DONE} color='red' key={TaskStatuses.DONE}>
								<Typography color='green'> Done </Typography>
							</MenuItem>
						</Select>
					</FormControl>
				</Stack>

				<Stack direction='row' spacing={1} alignItems='center'>

					<FormControl fullWidth>
						<InputLabel id="select-assignee-label-id">
							<Typography fontWeight='bold'>
								Assignee
							</Typography>
						</InputLabel>
						<Select
							labelId="select-assignee-label-id"
							id="select-assignee-id"
							value={task.assignee}
							label="Assignee"
							onChange={(e) => props.sharedTreeTask.assignee = e.target.value as string}
							size="small"
						>

							<MenuItem value={'UNASSIGNED'}>
								<Typography> Unassigned </Typography>
							</MenuItem>
							{
								engineers.map(engineer =>
									<MenuItem value={engineer.name} key={engineer.name}>
										<Typography> {engineer.name} </Typography>
									</MenuItem>
								)
							}
						</Select>
					</FormControl>
				</Stack>

				<Stack direction='row' spacing={1} alignItems='center'>
					<FormControl>
						<TextField
							id="input-assignee-label-id"
							label='Complexity'
							value={task.complexity}
							size="small"
						/>
					</FormControl>
				</Stack>
			</Stack>
		</Stack>
	</Card>;
}
