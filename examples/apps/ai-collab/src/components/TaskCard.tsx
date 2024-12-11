/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	aiCollab,
	type AiCollabErrorResponse,
	type AiCollabSuccessResponse,
	type Difference,
	type DifferenceChange,
	type DifferenceMove,
	SharedTreeBranchManager,
} from "@fluidframework/ai-collab/alpha";
import { TreeAlpha, type TreeBranch, type TreeViewAlpha } from "@fluidframework/tree/alpha";
import { Icon } from "@iconify/react";
import { LoadingButton } from "@mui/lab";
import {
	Box,
	Button,
	Card,
	Divider,
	FormControl,
	IconButton,
	InputLabel,
	MenuItem,
	Popover,
	Select,
	Stack,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { Tree, type TreeView } from "fluid-framework";
import { useSnackbar } from "notistack";
import React, { useState, type ReactNode, type SetStateAction } from "react";

// eslint-disable-next-line import/no-internal-modules
import { getOpenAiClient } from "@/infra/openAiClient";
import {
	SharedTreeTask,
	SharedTreeTaskGroup,
	SharedTreeAppState,
	TaskPriorities,
	type TaskPriority,
	TaskStatuses,
	aiCollabLlmTreeNodeValidator,
} from "@/types/sharedTreeAppSchema";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";

export function TaskCard(props: {
	sharedTreeBranch: TreeView<typeof SharedTreeAppState>;
	branchDifferences?: Difference[];
	sharedTreeTaskGroup: SharedTreeTaskGroup;
	sharedTreeTask: SharedTreeTask;
}): JSX.Element {
	const { enqueueSnackbar } = useSnackbar();

	const [aiPromptPopoverAnchor, setAiPromptPopoverAnchor] = useState<
		HTMLButtonElement | undefined
	>(undefined);
	const [diffOldValuePopoverAnchor, setDiffOldValuePopoverAnchor] = useState<
		HTMLButtonElement | undefined
	>(undefined);
	const [diffOldValue, setDiffOldValue] = useState<React.ReactNode>();
	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);

	useSharedTreeRerender({ sharedTreeNode: props.sharedTreeTask, logId: "TaskCard" });

	const [branchDifferences, setBranchDifferences] = useState(props.branchDifferences);

	const deleteTask = (): void => {
		const taskIndex = props.sharedTreeTaskGroup.tasks.indexOf(props.sharedTreeTask);
		props.sharedTreeTaskGroup.tasks.removeAt(taskIndex);
	};

	const fieldDifferences: {
		isNewCreation: boolean;
		changes: Record<string, DifferenceChange>;
		moved?: DifferenceMove;
	} = {
		isNewCreation: false,
		changes: {} satisfies Record<string, DifferenceChange>,
	};

	for (const diff of branchDifferences ?? []) {
		if (diff.type === "CHANGE") {
			const path = diff.path[diff.path.length - 1];
			if (path === undefined) {
				throw new Error(`List of paths in CHANGE diff is empty`);
			}
			fieldDifferences.changes[path] = diff;
		}
		if (diff.type === "CREATE") {
			fieldDifferences.isNewCreation = true;
		}
		if (diff.type === "MOVE") {
			fieldDifferences.moved = diff;
		}
	}

	let cardColor = "white";
	if (fieldDifferences.isNewCreation) {
		cardColor = "#e4f7e8";
	} else if (fieldDifferences.moved) {
		cardColor = "#e5c5fa";
	}

	/**
	 * Helper function for ai collaboration which creates a new branch from the current {@link SharedTreeAppState}
	 * as well as find the matching {@link SharedTreeTask} intended to be worked on within the new branch.
	 */
	const getNewSharedTreeBranchAndTask = (
		sharedTreeAppState: SharedTreeAppState,
		task: SharedTreeTask,
	): {
		currentBranch: TreeBranch;
		newBranchTree: TreeViewAlpha<typeof SharedTreeAppState>;
		newBranchTask: SharedTreeTask;
	} => {
		// 1. Create `TreeBranch` from the current `SharedTreeAppState` and fork it into a new branch.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const currentBranch = TreeAlpha.branch(sharedTreeAppState)!;
		const newBranchTree = currentBranch.fork();

		if (
			!currentBranch.hasRootSchema(SharedTreeAppState) ||
			!newBranchTree.hasRootSchema(SharedTreeAppState)
		) {
			throw new Error(
				"Cannot branch from a tree that does not have the SharedTreeAppState schema.",
			);
		}

		// 2. Now that we've created the new branch, we need to find the matching Task in that new branch.
		const parentTaskGroup = Tree.parent(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion, -- Note that two levels up from the task is the task group node.
			Tree.parent(task)!,
		) as SharedTreeTaskGroup;

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const newBranchTask = newBranchTree.root.taskGroups
			.find((taskGroup) => taskGroup.id === parentTaskGroup.id)!
			.tasks.find((_newBranchTask) => _newBranchTask.id === task.id)!;

		return { currentBranch, newBranchTree, newBranchTask };
	};

	/**
	 * Executes Ai Collaboration for this task based on the users request.
	 */
	const handleAiCollab = async (userRequest: string): Promise<void> => {
		setIsAiTaskRunning(true);
		enqueueSnackbar(`Copilot: I'm working on your request - "${userRequest}"`, {
			variant: "info",
			autoHideDuration: 5000,
		});

		try {
			// 1. Get the current branch, the new branch and associated task to be used for ai collaboration
			const { currentBranch, newBranchTree, newBranchTask } = getNewSharedTreeBranchAndTask(
				props.sharedTreeBranch.root,
				props.sharedTreeTask,
			);
			console.log("ai-collab Branch Task BEFORE:", { ...newBranchTask });

			// 2. execute the ai collaboration
			const response: AiCollabSuccessResponse | AiCollabErrorResponse = await aiCollab({
				openAI: {
					client: getOpenAiClient(),
					modelName: "gpt-4o",
				},
				treeNode: newBranchTask,
				prompt: {
					systemRoleContext:
						"You are a manager that is helping out with a project management tool. You have been asked to edit a specific task.",
					userAsk: userRequest,
				},
				planningStep: true,
				finalReviewStep: true,
				dumpDebugLog: true,
				validator: aiCollabLlmTreeNodeValidator,
			});

			if (response.status !== "success") {
				throw new Error(response.errorMessage);
			}

			// 3. Handle the response from the ai collaboration
			const taskDifferences = new SharedTreeBranchManager({
				nodeIdAttributeName: "id",
			}).compare(
				props.sharedTreeTask as unknown as Record<string, unknown>,
				newBranchTask as unknown as Record<string, unknown>,
			);

			enqueueSnackbar(`Copilot: I've completed your request - "${userRequest}"`, {
				variant: "success",
				autoHideDuration: 5000,
			});
			console.log("ai-collab Branch Task AFTER:", { ...newBranchTask });
			console.log("ai-collab Branch Task differences:", taskDifferences);

			setBranchDifferences(taskDifferences);
			// Note that we don't ask for user approval before merging changes at a task level for simplicites sake.
			currentBranch.merge(newBranchTree);
		} catch (error) {
			enqueueSnackbar(
				`Copilot: Something went wrong processing your request - ${error instanceof Error ? error.message : "unknown error"}`,
				{
					variant: "error",
					autoHideDuration: 5000,
				},
			);
		} finally {
			setAiPromptPopoverAnchor(undefined);
			setIsAiTaskRunning(false);
		}
	};

	return (
		<Card
			sx={{
				p: 4,
				position: "relative",
				backgroundColor: cardColor,
				width: "400px",
				height: "245px",
			}}
			key={`${props.sharedTreeTask.title}`}
		>
			{fieldDifferences.isNewCreation && (
				<Box component="span" sx={{ position: "absolute", top: -15, left: -7.5 }}>
					<IconButton>
						<Icon icon="clarity:new-solid" width={45} height={45} color="blue" />
					</IconButton>
				</Box>
			)}

			{fieldDifferences.moved !== undefined && (
				<Box component="span" sx={{ position: "absolute", top: 5, left: 5 }}>
					<Tooltip
						title={`This was moved from index: ${fieldDifferences.moved.path[fieldDifferences.moved.path.length - 1]}`}
					>
						<Icon icon="material-symbols:move-down" width={30} height={30} color="blue" />
					</Tooltip>
				</Box>
			)}

			<Box component="span" sx={{ position: "absolute", top: 0, right: 0 }}>
				<IconButton onClick={() => deleteTask()}>
					<Icon icon="zondicons:close-solid" width={20} height={20} />
				</IconButton>
			</Box>

			<Box mb={2}>
				<Stack direction="row" justifyContent="space-between" alignItems="center">
					<Box>
						<Typography variant="h1" fontSize={24}>
							{props.sharedTreeTask.title}
						</Typography>
						<Divider sx={{ fontSize: 12 }} />
					</Box>
					<Box>
						{aiPromptPopoverAnchor && (
							<Popover
								open={Boolean(aiPromptPopoverAnchor)}
								anchorEl={aiPromptPopoverAnchor}
								onClose={() => setAiPromptPopoverAnchor(undefined)}
								anchorOrigin={{
									vertical: "top",
									horizontal: "center",
								}}
								transformOrigin={{
									vertical: "bottom",
									horizontal: "center",
								}}
							>
								<Box
									component="form"
									sx={{ display: "flex", width: "500px", alignItems: "center", p: 2 }}
									// eslint-disable-next-line @typescript-eslint/no-misused-promises
									onSubmit={async (e) => {
										e.preventDefault();
										const formData = new FormData(e.currentTarget);
										const query = formData.get("searchQuery") as string;
										await handleAiCollab(query);
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

									<LoadingButton
										loading={isAiTaskRunning}
										type="submit"
										variant="contained"
										color="primary"
									>
										Send
									</LoadingButton>
								</Box>
							</Popover>
						)}
						<Button
							size="small"
							variant="contained"
							color="primary"
							sx={{ minWidth: "40px", padding: "4px" }}
							onClick={(event) => setAiPromptPopoverAnchor(event.currentTarget)}
						>
							<Icon icon="octicon:copilot-16" width={20} height={20} />
						</Button>
					</Box>
				</Stack>
			</Box>

			{diffOldValuePopoverAnchor && (
				<Popover
					open={Boolean(diffOldValuePopoverAnchor)}
					anchorEl={diffOldValuePopoverAnchor}
					onClose={() => setDiffOldValuePopoverAnchor(undefined)}
					anchorOrigin={{
						vertical: "top",
						horizontal: "center",
					}}
					transformOrigin={{
						vertical: "bottom",
						horizontal: "center",
					}}
				>
					<Card sx={{ p: 2 }}>
						<Stack direction={"column"} spacing={2} alignItems="center">
							<Typography>
								<Box component="span" sx={{ fontWeight: "bold" }}>
									{`Old Value: `}
								</Box>
								{diffOldValue}
							</Typography>
							<Button
								color="warning"
								variant="contained"
								size="small"
								sx={{ textTransform: "none", maxWidth: "150px" }}
							>
								Take Old Value
							</Button>
						</Stack>
					</Card>
				</Popover>
			)}

			<Stack direction="row" sx={{ mb: 2 }}>
				<TextField
					id="input-description-label-id"
					label="Description"
					value={props.sharedTreeTask.description}
					onChange={(e) => (props.sharedTreeTask.description = e.target.value)}
					sx={{ height: "100%", width: "100%" }}
					slotProps={{
						input: {
							multiline: true,
							sx: {
								alignItems: "flex-start",
								backgroundColor:
									fieldDifferences.changes.description === undefined ? "white" : "#a4dbfc",
							},
						},
						inputLabel: {
							sx: { fontWeight: "bold" },
						},
					}}
				/>
				{fieldDifferences.changes.description !== undefined && (
					<IconButton
						onClick={(event) => {
							setDiffOldValue(
								fieldDifferences.changes.description?.oldValue as SetStateAction<ReactNode>,
							);
							setDiffOldValuePopoverAnchor(event.currentTarget);
						}}
					>
						<Icon icon="clarity:info-standard-line" width={20} height={20} />
					</IconButton>
				)}
			</Stack>

			<Stack direction="row" spacing={2} width="100%">
				<Stack spacing={2} width="50%">
					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl fullWidth>
							<InputLabel id="select-priority-label-id">
								<Typography fontWeight="bold">Priority</Typography>
							</InputLabel>
							<Select
								labelId="select-priority-label-id"
								id="select-priority-id"
								value={props.sharedTreeTask.priority}
								label="Priority"
								onChange={(e) => {
									props.sharedTreeTask.priority = e.target.value as TaskPriority;
								}}
								inputProps={{
									sx: {
										backgroundColor:
											fieldDifferences.changes.priority === undefined ? "white" : "#a4dbfc",
									},
								}}
								size="small"
							>
								<MenuItem value={TaskPriorities.LOW} key={TaskPriorities.LOW}>
									<Typography color="blue"> Low </Typography>
								</MenuItem>
								<MenuItem
									value={TaskPriorities.MEDIUM}
									color="orange"
									key={TaskPriorities.MEDIUM}
								>
									<Typography color="orange"> Medium </Typography>
								</MenuItem>
								<MenuItem value={TaskPriorities.HIGH} color="red" key={TaskPriorities.HIGH}>
									<Typography color="red"> High </Typography>
								</MenuItem>
							</Select>
						</FormControl>

						{fieldDifferences.changes.priority !== undefined && (
							<IconButton
								onClick={(event) => {
									setDiffOldValue(
										fieldDifferences.changes.priority?.oldValue as SetStateAction<ReactNode>,
									);
									setDiffOldValuePopoverAnchor(event.currentTarget);
								}}
							>
								<Icon icon="clarity:info-standard-line" width={20} height={20} />
							</IconButton>
						)}
					</Stack>

					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl fullWidth>
							<InputLabel id="select-status-label-id">
								<Typography fontWeight="bold">Status</Typography>
							</InputLabel>
							<Select
								labelId="select-status-label-id"
								id="select-status-id"
								value={props.sharedTreeTask.status}
								label="Status"
								onChange={(e) => (props.sharedTreeTask.status = e.target.value)}
								size="small"
								inputProps={{
									sx: {
										backgroundColor:
											fieldDifferences.changes.status === undefined ? "white" : "#a4dbfc",
									},
								}}
							>
								<MenuItem value={TaskStatuses.TODO} key={TaskStatuses.TODO}>
									<Typography> Todo </Typography>
								</MenuItem>
								<MenuItem
									value={TaskStatuses.IN_PROGRESS}
									color="orange"
									key={TaskStatuses.IN_PROGRESS}
								>
									<Typography color="blue"> In Progress </Typography>
								</MenuItem>
								<MenuItem value={TaskStatuses.DONE} color="red" key={TaskStatuses.DONE}>
									<Typography color="green"> Done </Typography>
								</MenuItem>
							</Select>
						</FormControl>
					</Stack>
				</Stack>

				<Stack spacing={2} width="50%">
					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl fullWidth>
							<InputLabel id="select-assignee-label-id">
								<Typography fontWeight="bold">Assignee</Typography>
							</InputLabel>
							<Select
								labelId="select-assignee-label-id"
								id="select-assignee-id"
								value={props.sharedTreeTask.assignee}
								label="Assignee"
								onChange={(e) => (props.sharedTreeTask.assignee = e.target.value)}
								size="small"
								inputProps={{
									sx: {
										backgroundColor:
											fieldDifferences.changes.assignee === undefined ? "white" : "#a4dbfc",
									},
								}}
							>
								<MenuItem value={"UNASSIGNED"}>
									<Typography> Unassigned </Typography>
								</MenuItem>
								{props.sharedTreeTaskGroup.engineers.map((engineer) => (
									<MenuItem value={engineer.name} key={engineer.id}>
										<Typography> {engineer.name} </Typography>
									</MenuItem>
								))}
							</Select>
						</FormControl>
						{fieldDifferences.changes.assignee !== undefined && (
							<IconButton
								onClick={(event) => {
									setDiffOldValue(
										fieldDifferences.changes.assignee?.oldValue as SetStateAction<ReactNode>,
									);
									setDiffOldValuePopoverAnchor(event.currentTarget);
								}}
							>
								<Icon icon="clarity:info-standard-line" width={20} height={20} />
							</IconButton>
						)}
					</Stack>

					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl>
							<TextField
								id="input-assignee-label-id"
								label="Complexity"
								value={props.sharedTreeTask.complexity}
								size="small"
								slotProps={{
									htmlInput: {
										sx: {
											backgroundColor:
												fieldDifferences.changes.complexity === undefined
													? "white"
													: "#a4dbfc",
										},
									},
								}}
							/>
						</FormControl>
					</Stack>
				</Stack>
			</Stack>
		</Card>
	);
}
