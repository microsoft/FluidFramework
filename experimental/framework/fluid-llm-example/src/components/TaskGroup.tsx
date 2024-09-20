import { SharedTreeEngineerList, SharedTreeTaskGroup, SharedTreeTaskGroupList, sharedTreeTaskGroupToJson, SharedTreeTaskList, type SharedTreeAppState } from "@/types/sharedTreeAppSchema";
import { Box, Button, Card, CircularProgress, Dialog, DialogContent, Divider, Fab, FormControl, IconButton, InputLabel, MenuItem, Modal, Popover, Select, Stack, Tabs, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { TaskCard } from "./TaskCard";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Tree, type TreeView } from "@fluidframework/tree";
import { editTaskGroup } from "@/actions/task";
import { LoadingButton } from "@mui/lab";
import { SharedTreeBranchManager, type Difference, type DifferenceChange } from "@fluid-experimental/fluid-llm";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";

export function TaskGroup(props: {
	sharedTreeBranch?: TreeView<typeof SharedTreeAppState>,
	branchDifferences?: Difference[],
	sharedTreeTaskGroup: SharedTreeTaskGroup
}) {
	const [isTitleEditing, setIsTitleEditing] = useState(false);
	const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
	const [isDiffModalOpen, setIsDiffModelOpen] = useState(false);

	const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | null>(null);
	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);

	// const [forceReRender, setForceReRender] = useState<number>(0);
	// useEffect(() => {
	// 	const treeNodeListenerStopFunctions: VoidFunction[] = [];

	// 	const listenerStopFunction = Tree.on(props.sharedTreeTaskGroup, "nodeChanged", () => {
	// 		console.log('TaskGroup: nodeChanged');
	// 	});

	// 	const listenerStopFunction2 = Tree.on(props.sharedTreeTaskGroup, "treeChanged", () => {
	// 		console.log('TaskGroup: treeChanged');
	// 		// events seem to be coming in from a branch of the same tree, we can ignore them when we know that branch is being worked on.
	// 		setForceReRender(prevReRender => { return prevReRender + 1; });
	// 	});

	// 	treeNodeListenerStopFunctions.push(listenerStopFunction, listenerStopFunction2);

	// 	// Clean up tree node listeners.
	// 	return () => {
	// 		treeNodeListenerStopFunctions.forEach(stopFunction => stopFunction());
	// 	};
	// }, [props.sharedTreeTaskGroup]);

	// const forceRerenderCount = useSharedTreeRerender({ sharedTreeNode: props.sharedTreeTaskGroup });




	const [llmBranchData, setLlmBranchData] = useState<{ differences: Difference[], newBranch: TreeView<typeof SharedTreeAppState>, newBranchTargetNode: SharedTreeTaskGroup }>();

	return <Card sx={{
		p: 7,
		background: 'rgba(255, 255, 255, 0.5)',
		borderRadius: '16px',
		boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
		backdropFilter: 'blur(18px);',
		WebkitBackdropFilter: 'blur(18px)',
		border: '1px solid rgba(255, 255, 255, 0.3)',
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

			<Dialog
				open={isDiffModalOpen}
				onClose={() => setIsDiffModelOpen(false)}
				aria-labelledby="modal-modal-title"
				aria-describedby="modal-modal-description"
				sx={{ overflow: 'auto' }}
				maxWidth={'xl'}
				fullWidth={true}
				PaperProps={{
					sx: { background: 'none' }
				}}
			>

				{llmBranchData &&
					<Box sx={{
						maxWidth: '100%',
						background: 'rgba(255, 255, 255, 0.38)',
						borderRadius: '16px',
						boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
						backdropFilter: 'blur(12px);',
						'-webkit-backdrop-filter': 'blur(12px)',
						border: '1px solid rgba(255, 255, 255, 0.3)',
						p: 2
					}}>
						<Box sx={{ my: 2 }}>
							<Typography variant='h2' textAlign={'center'} sx={{ my: 1 }}>
								Preview Of Copliot Changes
							</Typography>
							<Stack direction='row' spacing={2} sx={{ justifyContent: 'center' }}>
								<Button variant="contained" color='success' sx={{ textTransform: 'none' }}>Accept Changes</Button>
								<Button variant="contained" color='error' sx={{ textTransform: 'none' }}>Decline Changes</Button>
								<Button variant="contained" color='info' sx={{ textTransform: 'none' }}>Rerun changes</Button>
							</Stack>
						</Box>
						<TaskGroup sharedTreeBranch={llmBranchData?.newBranch} sharedTreeTaskGroup={llmBranchData?.newBranchTargetNode as SharedTreeTaskGroup} branchDifferences={llmBranchData?.differences} />
					</Box>
				}

			</Dialog >

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

						// METHOD 1: Overwrite the entire task object
						// if (resp.success) {
						// 	// We don't know what exactly changed, So we just update everything.
						// 	props.sharedTreeTaskGroup.title = resp.data.title;
						// 	props.sharedTreeTaskGroup.description = resp.data.description;
						// 	props.sharedTreeTaskGroup.tasks = new SharedTreeTaskList(resp.data.tasks);
						// 	props.sharedTreeTaskGroup.engineers = new SharedTreeEngineerList(resp.data.engineers);
						// }

						// METHOD 2: Update only the changed fields using a merge function
						// Still will be stale work because the "branch" the llm recieved was at request initiation, not at response time.
						// if (resp.success) {
						// 	const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: 'id' });
						// 	console.log('merginging llm response in to the following tree', sharedTreeTaskGroupToJson(props.sharedTreeTaskGroup))
						// 	branchManager.merge(props.sharedTreeTaskGroup as unknown as Record<string, unknown>, resp.data as unknown as Record<string, unknown>);
						// }

						// METHOD 3: Update only the changed fields into a new branch of the data
						if (resp.success && props.sharedTreeBranch) {
							console.log('initiating checkoutNewMergedBranch')
							const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: 'id' });

							const { differences, newBranch, newBranchTargetNode } =
								branchManager.checkoutNewMergedBranch(
									props.sharedTreeBranch,
									['taskGroups', props.sharedTreeBranch.root.taskGroups.indexOf(props.sharedTreeTaskGroup)],
									resp.data as unknown as Record<string, unknown>
								);

							// Do something with the new branch, like a preview.
							console.log('newBranch: ', newBranch);
							console.log('newBranchTargetNode: ', { ...newBranchTargetNode });
							console.log('differences: ', { ...differences });
							setLlmBranchData({ differences, newBranch, newBranchTargetNode: newBranchTargetNode as unknown as SharedTreeTaskGroup });
							setIsDiffModelOpen(true);
						}
					}}
				>
					<TextField
						id="search-bar"
						name="searchQuery"
						label="Ask AI For Help"
						variant="outlined"
						multiline
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

			{props.sharedTreeTaskGroup.tasks.map(task => {

				const taskDiffs = props.branchDifferences
					? props.branchDifferences.filter(diff =>
						diff.path[0] === 'tasks' &&
						diff.type !== 'CREATE' &&
						diff.objectId === task.id
					)
					: undefined
				return <TaskCard key={task.id} sharedTreeTaskGroup={props.sharedTreeTaskGroup} sharedTreeTask={task} branchDifferences={taskDiffs} />
			}
			)}
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
	</Card >




}
