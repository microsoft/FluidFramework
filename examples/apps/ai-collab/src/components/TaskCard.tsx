/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	type Difference,
	type DifferenceChange,
	type DifferenceMove,
	SharedTreeBranchManager,
} from "@fluid-experimental/ai-collab";
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
import { type TreeView } from "fluid-framework";
import { useSnackbar } from "notistack";
import React, { useState, type ReactNode, type SetStateAction } from "react";

import { editTask } from "@/actions/task";
import {
	SharedTreeTask,
	SharedTreeTaskGroup,
	type SharedTreeAppState,
} from "@/types/sharedTreeAppSchema";
import {
	TaskPriorities,
	TaskStatuses,
	type Task,
	type TaskPriority,
	type TaskStatus,
} from "@/types/task";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";

function convertSharedTreeTaskToTask(sharedTreeTask: SharedTreeTask): Task {
	return {
		id: sharedTreeTask.id,
		assignee: sharedTreeTask.assignee,
		title: sharedTreeTask.title,
		description: sharedTreeTask.description,
		priority: sharedTreeTask.priority as TaskPriority,
		complexity: sharedTreeTask.complexity,
		status: sharedTreeTask.status as TaskStatus,
	};
}

export function TaskCard(props: {
	sharedTreeBranch?: TreeView<typeof SharedTreeAppState>;
	branchDifferences?: Difference[];
	sharedTreeTaskGroup: SharedTreeTaskGroup;
	sharedTreeTask: SharedTreeTask;
}): JSX.Element {
	// if (props.branchDifferences) {
	// 	console.log(`Task id ${props.sharedTreeTask.id} recieved branchDifferences: `, props.branchDifferences);
	// }

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

	const deleteTask = (): void => {
		const taskIndex = props.sharedTreeTaskGroup.tasks.indexOf(props.sharedTreeTask);
		props.sharedTreeTaskGroup.tasks.removeAt(taskIndex);
	};

	const task: Task = convertSharedTreeTaskToTask(props.sharedTreeTask);

	const fieldDifferences: {
		isNewCreation: boolean;
		changes: Record<string, DifferenceChange>;
		moved?: DifferenceMove;
	} = {
		isNewCreation: false,
		changes: {} satisfies Record<string, DifferenceChange>,
	};

	for (const diff of props.branchDifferences ?? []) {
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

	return (
		<Card
			sx={{
				p: 4,
				position: "relative",
				width: "100%",
				backgroundColor: cardColor,
			}}
			key={`${task.title}`}
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
							{task.title}
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

										setIsAiTaskRunning(true);
										enqueueSnackbar(`Copilot: I'm working on your request - "${query}"`, {
											variant: "info",
											autoHideDuration: 5000,
										});

										const response = await editTask(task, query);

										setIsAiTaskRunning(false);

										if (response.success) {
											enqueueSnackbar(`Copilot: I've completed your request - "${query}"`, {
												variant: "success",
												autoHideDuration: 5000,
											});

											const branchManager = new SharedTreeBranchManager({
												nodeIdAttributeName: "id",
											});
											branchManager.mergeObject(
												props.sharedTreeTask as unknown as Record<string, unknown>,
												response.data as unknown as Record<string, unknown>,
											);
											setAiPromptPopoverAnchor(undefined);
										} else {
											enqueueSnackbar(
												`Copilot: Something went wrong processing your request - "${query}"`,
												{ variant: "error", autoHideDuration: 5000 },
											);
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

			<Stack direction="row" sx={{ width: "100%" }} spacing={2}>
				<Stack sx={{ flexGrow: 1, direction: "row" }}>
					<Stack direction="row">
						<TextField
							id="input-description-label-id"
							label="Description"
							value={task.description}
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
										fieldDifferences.changes.description
											?.oldValue as SetStateAction<ReactNode>,
									);
									setDiffOldValuePopoverAnchor(event.currentTarget);
								}}
							>
								<Icon icon="clarity:info-standard-line" width={20} height={20} />
							</IconButton>
						)}
					</Stack>
				</Stack>

				<Stack spacing={1} minWidth={180}>
					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl fullWidth>
							<InputLabel id="select-priority-label-id">
								<Typography fontWeight="bold">Priority</Typography>
							</InputLabel>
							<Select
								labelId="select-priority-label-id"
								id="select-priority-id"
								value={task.priority}
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
								value={task.status}
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

					<Stack direction="row" spacing={1} alignItems="center">
						<FormControl fullWidth>
							<InputLabel id="select-assignee-label-id">
								<Typography fontWeight="bold">Assignee</Typography>
							</InputLabel>
							<Select
								labelId="select-assignee-label-id"
								id="select-assignee-id"
								value={task.assignee}
								label="Assignee"
								onChange={(e) => (props.sharedTreeTask.assignee = e.target.value as string)}
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
								value={task.complexity}
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
