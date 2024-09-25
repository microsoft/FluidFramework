import { SharedTreeTaskGroup, sharedTreeTaskGroupToJson, type SharedTreeAppState } from "@/types/sharedTreeAppSchema";
import { Box, Button, Card, CircularProgress, Dialog, Divider, Popover, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { TaskCard } from "./TaskCard";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Tree, type TreeView } from "@fluidframework/tree";
import { editTaskGroup } from "@/actions/task";
import { LoadingButton } from "@mui/lab";
import { branch, merge, SharedTreeBranchManager, type Difference, type DifferenceChange } from "@fluid-experimental/fluid-llm";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";
import { useSnackbar } from 'notistack';


export function TaskGroup(props: {
	sharedTreeBranch: TreeView<typeof SharedTreeAppState>,
	branchDifferences?: Difference[],
	sharedTreeTaskGroup: SharedTreeTaskGroup
}) {
	const { enqueueSnackbar } = useSnackbar();

	const [isTitleEditing, setIsTitleEditing] = useState(false);
	const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
	const [isDiffModalOpen, setIsDiffModelOpen] = useState(false);

	const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | null>(null);
	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);
	const [llmBranchData, setLlmBranchData] = useState<{ differences: Difference[], newBranch: TreeView<typeof SharedTreeAppState>, newBranchTargetNode: SharedTreeTaskGroup }>();

	useSharedTreeRerender({ sharedTreeNode: props.sharedTreeTaskGroup, logId: 'TaskGroup' });

	return <Card sx={{
		p: 7,
		background: 'rgba(255, 255, 255, 0.5)',
		borderRadius: '16px',
		boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
		backdropFilter: 'blur(18px);',
		WebkitBackdropFilter: 'blur(18px)',
		border: '1px solid rgba(255, 255, 255, 0.3)',
	}}>
		<Stack direction='row' spacing={1} alignItems='center'>
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

				{props.sharedTreeBranch !== undefined && llmBranchData &&
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
						<Stack sx={{ my: 2 }} spacing={2}>
							<Typography variant='h2' textAlign={'center'} >
								Preview Of Copliot Changes
							</Typography>
							<Stack direction='row' spacing={2} justifyContent={'center'} sx={{ alignItems: 'center' }}>
								<Typography variant='h6'>Differences Color Key:</Typography>
								<Stack direction='row' alignItems='center' spacing={1}>
									<Box sx={{ borderRadius: '50%', backgroundColor: '#f7c3c3', width: 20, height: 20 }} />
									<Typography variant='body1'>Deleted</Typography>
								</Stack>

								<Stack direction='row' alignItems='center' spacing={1}>
									<Box sx={{ borderRadius: '50%', backgroundColor: '#cbf7d4', width: 20, height: 20 }} />
									<Typography variant='body1'>New</Typography>
								</Stack>

								<Stack direction='row' alignItems='center' spacing={1}>
									<Box sx={{ borderRadius: '50%', backgroundColor: '#a4dbfc', width: 20, height: 20 }} />
									<Typography variant='body1'>Changed</Typography>
								</Stack>


								<Stack direction='row' alignItems='center' spacing={1}>
									<Box sx={{ borderRadius: '50%', backgroundColor: '#e5c5fa', width: 20, height: 20 }} />
									<Typography variant='body1'>Moved</Typography>
								</Stack>
							</Stack>
							<Stack direction='row' spacing={2} sx={{ justifyContent: 'center' }}>
								<Button variant="contained" color='success' sx={{ textTransform: 'none' }}
									onClick={() => {
										merge(llmBranchData.newBranch, props.sharedTreeBranch!);
										setIsDiffModelOpen(false);
									}}
								> Accept Changes </Button>

								<Button variant="contained" color='error' sx={{ textTransform: 'none' }}
									onClick={() => setIsDiffModelOpen(false)}
								> Decline Changes </Button>

								<Button variant="contained" color='info' sx={{ textTransform: 'none' }}
								> Rerun changes </Button>
							</Stack>


						</Stack>
						<TaskGroup sharedTreeBranch={llmBranchData?.newBranch} sharedTreeTaskGroup={llmBranchData?.newBranchTargetNode as SharedTreeTaskGroup} branchDifferences={llmBranchData?.differences} />
					</Box>
				}

			</Dialog >

			<Button variant='contained' color='success'
				onClick={() => {
					props.sharedTreeTaskGroup.tasks.insertAtStart({
						title: "New Task",
						description: "This is the new task. ",
						priority: "low",
						complexity: 1,
						status: "todo",
						assignee: "UNASSIGNED"
					});
				}}
			>New Task</Button>

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
						setIsAiTaskRunning(true);
						enqueueSnackbar(
							`Copilot: I'm working on your request - "${query}"`,
							{ variant: 'info', autoHideDuration: 5000 }
						);

						const llmChangeBranch = branch(props.sharedTreeBranch);
						const indexOfTaskGroup = props.sharedTreeBranch.root.taskGroups.indexOf(props.sharedTreeTaskGroup);
						const targetTaskGroup = llmChangeBranch.root.taskGroups[indexOfTaskGroup];

						const resp = await editTaskGroup(sharedTreeTaskGroupToJson(targetTaskGroup), query);
						if (resp.success) {
							console.log('initiating checkoutNewMergedBranch')
							const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: 'id' });

							const differences = branchManager.compare(targetTaskGroup as unknown as Record<string, unknown>, resp.data as unknown as Record<string, unknown>);
							const { newBranch, newBranchTargetNode } = branchManager.checkoutNewMergedBranchV2(
								props.sharedTreeBranch,
								['taskGroups', indexOfTaskGroup],
								differences
							)

							console.log('newBranch: ', newBranch);
							console.log('newBranchTargetNode: ', { ...newBranchTargetNode });
							console.log('differences: ', { ...differences });
							setLlmBranchData({ differences, newBranch, newBranchTargetNode: newBranchTargetNode as unknown as SharedTreeTaskGroup });
							setIsDiffModelOpen(true);
							enqueueSnackbar(
								`Copilot: I've completed your request - "${query}"`,
								{ variant: 'success', autoHideDuration: 5000 }
							);
						} else {
							enqueueSnackbar(
								`Copilot: Something went wrong processing your request - "${query}"`,
								{ variant: 'error', autoHideDuration: 5000 }
							);
						}

						setIsAiTaskRunning(false);
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
				variant='contained'
				color="primary"
				sx={{ minWidth: '40px' }}
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


		{/* Render Task Card list */}
		<Stack spacing={2} sx={{ alignItems: 'center' }}>
			{props.sharedTreeTaskGroup.tasks.map(task => {
				const taskDiffs: Difference[] = [];
				props.branchDifferences?.forEach(diff => {
					if (diff.path[0] === 'tasks') {
						if (diff.type !== 'CREATE' && diff.objectId === task.id) {
							taskDiffs.push(diff);
						} else {
							if (diff.type === 'CREATE') {
								const newTaskFromDiff = diff.value as SharedTreeTaskGroup;
								if (newTaskFromDiff.id === task.id) {
									taskDiffs.push(diff);
								}
							}
						}
					}
				});
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
