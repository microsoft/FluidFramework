import { SharedTreeEngineerList, SharedTreeTaskGroup, SharedTreeTaskGroupList, sharedTreeTaskGroupToJson, SharedTreeTaskList } from "@/types/sharedTreeAppSchema";
import { Box, Button, Card, CircularProgress, Divider, Fab, FormControl, IconButton, InputLabel, MenuItem, Popover, Select, Stack, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { TaskCard } from "./TaskCard";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Tree } from "@fluidframework/tree";
import { editTaskGroup } from "@/actions/task";
import { LoadingButton } from "@mui/lab";

export function TaskGroup(props: { sharedTreeTaskGroup: SharedTreeTaskGroup }) {
	const [isTitleEditing, setIsTitleEditing] = useState(false);
	const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);

	const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | null>(null);
	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);

	const [forceReRender, setForceReRender] = useState<number>(0);
	useEffect(() => {
		const treeNodeListenerStopFunctions: VoidFunction[] = [];

		const listenerStopFunction = Tree.on(props.sharedTreeTaskGroup, "nodeChanged", () => {
			console.log('TaskGroup: nodeChanged');
		});

		const listenerStopFunction2 = Tree.on(props.sharedTreeTaskGroup, "treeChanged", () => {
			console.log('TaskGroup: treeChanged');
			setForceReRender(prevReRender => { return prevReRender + 1; });
		});

		treeNodeListenerStopFunctions.push(listenerStopFunction, listenerStopFunction2);

		// Clean up tree node listeners.
		return () => {
			treeNodeListenerStopFunctions.forEach(stopFunction => stopFunction());
		};
	}, [props.sharedTreeTaskGroup]);



	return <Card sx={{
		p: 7, width: '100%',
		borderRadius: '50px',
		background: '#f0edea',
		boxShadow: '25px 25px 50px #b9b6b4, -20px -20px 50px #ffffff'
	}}>
		<Stack direction='row' spacing={1}>
			{isTitleEditing
				? <TextField
					id="input-description-label-id"
					label='Title'
					value={props.sharedTreeTaskGroup.title}
					onChange={(e) => props.sharedTreeTaskGroup.title = e.target.value}
					fullWidth
					slotProps={{
						input: {
							multiline: true,
							sx: { alignItems: 'flex-start', backgroundColor: 'white' }
						},
						inputLabel: {
							sx: { fontWeight: 'bold' }
						}
					}}
				/>
				: <Typography variant="h3" sx={{ my: 3 }}>
					{props.sharedTreeTaskGroup.title}
				</Typography>
			}
			<Button variant='text' sx={{ p: 0, minWidth: 10, height: 10 }} size='small' onClick={() => setIsTitleEditing(!isTitleEditing)}>
				<Icon icon='eva:edit-2-fill' width={20} height={20} />
			</Button>

			<Box sx={{ flexGrow: 1 }}></Box>

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
						const resp = await editTaskGroup(sharedTreeTaskGroupToJson(props.sharedTreeTaskGroup), query);
						setIsAiTaskRunning(false);
						if (resp.success) {
							// We don't know what exactly changed, So we just update everything.
							props.sharedTreeTaskGroup.title = resp.data.title;
							props.sharedTreeTaskGroup.description = resp.data.description;
							props.sharedTreeTaskGroup.tasks = new SharedTreeTaskList(resp.data.tasks);
							props.sharedTreeTaskGroup.engineers = new SharedTreeEngineerList(resp.data.engineers);
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

		</Stack>

		<Stack direction='row' spacing={1} sx={{ my: 2 }}>
			{isDescriptionEditing
				? <TextField
					id="input-description-label-id"
					label='Description'
					value={props.sharedTreeTaskGroup.description}
					onChange={(e) => props.sharedTreeTaskGroup.description = e.target.value}
					fullWidth
					slotProps={{
						input: {
							multiline: true,
							sx: { alignItems: 'flex-start', backgroundColor: 'white' }
						},
						inputLabel: {
							sx: { fontWeight: 'bold' }
						}
					}}
				/>
				: <Typography variant="body1" sx={{ my: 3 }}>
					{props.sharedTreeTaskGroup.description}
				</Typography>
			}
			<Button variant='text' sx={{ p: 0, minWidth: 10, height: 10 }} size='small' onClick={() => setIsDescriptionEditing(!isDescriptionEditing)}>
				<Icon icon='eva:edit-2-fill' width={20} height={20} />
			</Button>
		</Stack>


		<Stack spacing={2} sx={{ alignItems: 'center' }}>
			{props.sharedTreeTaskGroup.tasks.map(task => (
				<TaskCard key={task.id} sharedTreeTaskGroup={props.sharedTreeTaskGroup} sharedTreeTask={task} engineers={props.sharedTreeTaskGroup.engineers} />
			))}
		</Stack>


		<Typography variant="h2" sx={{ my: 3 }}>
			Engineers
		</Typography>

		<Stack spacing={1}>
			{
				props.sharedTreeTaskGroup.engineers.map(engineer => {
					const engineerCapacity = props.sharedTreeTaskGroup.tasks
						.filter(task => task.assignee === engineer.name)
						.reduce((acc, task) => acc + task.complexity, 0);

					const capacityColor = engineerCapacity > engineer.maxCapacity ? 'red' : 'green';

					return <Card sx={{ p: 2, width: 600 }} key={engineer.name}>
						<Box mb={2}>
							<Typography variant='h1' fontSize={24}>{engineer.name}</Typography>
							<Divider sx={{ fontSize: 12 }} />
						</Box>

						<Typography variant='h4' fontSize={20} fontWeight={'bold'}>
							{`Capacity: `}
							<Box display='inline' color={capacityColor}>{`${engineerCapacity} / ${engineer.maxCapacity}`}</Box>
						</Typography>

						<Stack direction='row' sx={{ width: '100%' }}>
							<Stack sx={{ flexGrow: 1 }}>
								<Typography variant='h4' fontSize={20} fontWeight={'bold'} >Skills</Typography>
								<Typography variant='body1'>{engineer.skills}</Typography>
							</Stack>
						</Stack>
					</Card>
				})
			}
		</Stack>
	</Card>




}
