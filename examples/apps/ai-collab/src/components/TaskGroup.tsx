/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Difference, SharedTreeBranchManager } from "@fluidframework/ai-collab/alpha";
import {
	type BranchableTree,
	type TreeBranchFork,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";
import { Icon } from "@iconify/react";
import { LoadingButton } from "@mui/lab";
import {
	Box,
	Button,
	Card,
	Dialog,
	Divider,
	Popover,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { type TreeView } from "fluid-framework";
import { useSnackbar } from "notistack";
import React, { useState } from "react";

import { TaskCard } from "./TaskCard";

import { editTaskGroup } from "@/actions/task";
import {
	SharedTreeTaskGroup,
	sharedTreeTaskGroupToJson,
	TREE_CONFIGURATION,
	type SharedTreeAppState,
} from "@/types/sharedTreeAppSchema";
import { useSharedTreeRerender } from "@/useSharedTreeRerender";

export function TaskGroup(props: {
	treeView: TreeView<typeof SharedTreeAppState>;
	branchDifferences?: Difference[];
	sharedTreeTaskGroup: SharedTreeTaskGroup;
}): JSX.Element {
	const { enqueueSnackbar } = useSnackbar();

	const [isTitleEditing, setIsTitleEditing] = useState(false);
	const [isDescriptionEditing, setIsDescriptionEditing] = useState(false);
	const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);

	const [popoverAnchor, setPopoverAnchor] = useState<HTMLButtonElement | undefined>(undefined);
	const [isAiTaskRunning, setIsAiTaskRunning] = useState<boolean>(false);
	const [llmBranchData, setLlmBranchData] = useState<{
		differences: Difference[];
		originalBranch: BranchableTree;
		forkBranch: TreeBranchFork;
		forkView: TreeView<typeof SharedTreeAppState>;
		newBranchTargetNode: SharedTreeTaskGroup;
	}>();

	useSharedTreeRerender({ sharedTreeNode: props.sharedTreeTaskGroup, logId: "TaskGroup" });

	return (
		<Card
			sx={{
				p: 7,
				width: "90%",
				background: "rgba(255, 255, 255, 0.5)",
				borderRadius: "16px",
				boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
				backdropFilter: "blur(18px);",
				WebkitBackdropFilter: "blur(18px)",
				border: "1px solid rgba(255, 255, 255, 0.3)",
			}}
		>
			<Stack direction="row" spacing={1} alignItems="center">
				{isTitleEditing ? (
					<TextField
						id="input-description-label-id"
						label="Title"
						value={props.sharedTreeTaskGroup.title}
						onChange={(e) => (props.sharedTreeTaskGroup.title = e.target.value)}
						fullWidth
						slotProps={{
							input: {
								multiline: true,
								sx: { alignItems: "flex-start", backgroundColor: "white" },
							},
							inputLabel: {
								sx: { fontWeight: "bold" },
							},
						}}
					/>
				) : (
					<Typography variant="h3" sx={{ my: 3 }}>
						{props.sharedTreeTaskGroup.title}
					</Typography>
				)}
				<Button
					variant="text"
					sx={{ p: 0, minWidth: 10, height: 10 }}
					size="small"
					onClick={() => setIsTitleEditing(!isTitleEditing)}
				>
					<Icon icon="eva:edit-2-fill" width={20} height={20} />
				</Button>

				<Box sx={{ flexGrow: 1 }}></Box>

				{isDiffModalOpen && props.treeView !== undefined && llmBranchData && (
					<TaskGroupDiffModal
						isOpen={isDiffModalOpen}
						onClose={() => {
							setIsDiffModalOpen(false);
							setLlmBranchData(undefined);
							setPopoverAnchor(undefined);
						}}
						onAccept={() => {
							llmBranchData.originalBranch.merge(llmBranchData.forkBranch);
							setIsDiffModalOpen(false);
							setLlmBranchData(undefined);
							setPopoverAnchor(undefined);
						}}
						onDecline={() => {
							setIsDiffModalOpen(false);
							setLlmBranchData(undefined);
							setPopoverAnchor(undefined);
						}}
						treeView={llmBranchData.forkView}
						differences={llmBranchData.differences}
						newBranchTargetNode={llmBranchData.newBranchTargetNode}
					></TaskGroupDiffModal>
				)}

				<Button
					variant="contained"
					color="success"
					onClick={() => {
						props.sharedTreeTaskGroup.tasks.insertAtStart({
							title: `New Task #${props.sharedTreeTaskGroup.tasks.length + 1}`,
							description: "This is the new task. ",
							priority: "low",
							complexity: 1,
							status: "todo",
							assignee: "UNASSIGNED",
						});
					}}
				>
					New Task
				</Button>

				{popoverAnchor && (
					<Popover
						open={Boolean(popoverAnchor)}
						anchorEl={popoverAnchor}
						onClose={() => setPopoverAnchor(undefined)}
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

								// TODO: is this redundant? We already have props.sharedTreeTaskGroup
								const indexOfTaskGroup = props.treeView.root.taskGroups.indexOf(
									props.sharedTreeTaskGroup,
								);

								const resp = await editTaskGroup(
									sharedTreeTaskGroupToJson(props.sharedTreeTaskGroup),
									query,
								);
								if (resp.success) {
									console.log("initiating checkoutNewMergedBranch");
									const branchManager = new SharedTreeBranchManager({
										nodeIdAttributeName: "id",
									});

									const differences = branchManager.compare(
										props.sharedTreeTaskGroup as unknown as Record<string, unknown>,
										resp.data as unknown as Record<string, unknown>,
									);
									const { originalBranch, forkBranch, forkView, newBranchTargetNode } =
										branchManager.checkoutNewMergedBranchV2(
											// TODO: Remove cast when TreeViewAlpha becomes public
											props.treeView as TreeViewAlpha<typeof SharedTreeAppState>,
											TREE_CONFIGURATION,
											["taskGroups", indexOfTaskGroup],
										);

									branchManager.mergeDiffs(differences, newBranchTargetNode);

									console.log("forkBranch:", forkBranch);
									console.log("newBranchTargetNode:", { ...newBranchTargetNode });
									console.log("differences:", { ...differences });
									setLlmBranchData({
										differences,
										originalBranch,
										forkBranch,
										forkView,
										newBranchTargetNode: newBranchTargetNode as unknown as SharedTreeTaskGroup,
									});
									setIsDiffModalOpen(true);
									enqueueSnackbar(`Copilot: I've completed your request - "${query}"`, {
										variant: "success",
										autoHideDuration: 5000,
									});
								} else {
									enqueueSnackbar(
										`Copilot: Something went wrong processing your request - "${query}"`,
										{ variant: "error", autoHideDuration: 5000 },
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
					variant="contained"
					color="primary"
					sx={{ minWidth: "40px" }}
					onClick={(event) => setPopoverAnchor(event.currentTarget)}
				>
					<Icon icon="octicon:copilot-16" width={20} height={20} />
				</Button>
			</Stack>

			<Stack direction="row" spacing={1} sx={{ my: 2 }}>
				{isDescriptionEditing ? (
					<TextField
						id="input-description-label-id"
						label="Description"
						value={props.sharedTreeTaskGroup.description}
						onChange={(e) => (props.sharedTreeTaskGroup.description = e.target.value)}
						fullWidth
						slotProps={{
							input: {
								multiline: true,
								sx: { alignItems: "flex-start", backgroundColor: "white" },
							},
							inputLabel: {
								sx: { fontWeight: "bold" },
							},
						}}
					/>
				) : (
					<Typography variant="body1" sx={{ my: 3 }}>
						{props.sharedTreeTaskGroup.description}
					</Typography>
				)}
				<Button
					variant="text"
					sx={{ p: 0, minWidth: 10, height: 10 }}
					size="small"
					onClick={() => setIsDescriptionEditing(!isDescriptionEditing)}
				>
					<Icon icon="eva:edit-2-fill" width={20} height={20} />
				</Button>
			</Stack>

			{/* Render Task Card list */}
			<Stack direction="row" spacing={{ xs: 1, sm: 2 }} useFlexGap sx={{ flexWrap: "wrap" }}>
				{props.sharedTreeTaskGroup.tasks.map((task) => {
					const taskDiffs: Difference[] = [];
					for (const diff of props.branchDifferences ?? []) {
						if (diff.path[0] === "tasks") {
							if (diff.type !== "CREATE" && diff.objectId === task.id) {
								taskDiffs.push(diff);
							} else {
								if (diff.type === "CREATE") {
									const newTaskFromDiff = diff.value as SharedTreeTaskGroup;
									if (newTaskFromDiff.id === task.id) {
										taskDiffs.push(diff);
									}
								}
							}
						}
					}
					return (
						<TaskCard
							key={task.id}
							sharedTreeTaskGroup={props.sharedTreeTaskGroup}
							sharedTreeTask={task}
							branchDifferences={taskDiffs}
						/>
					);
				})}
			</Stack>

			<Typography variant="h2" sx={{ my: 3 }}>
				Engineers
			</Typography>

			<Stack direction="row" spacing={{ xs: 1, sm: 2 }} sx={{ flexWrap: "wrap" }}>
				{props.sharedTreeTaskGroup.engineers.map((engineer) => {
					const engineerCapacity = props.sharedTreeTaskGroup.tasks
						.filter((task) => task.assignee === engineer.name)
						.reduce((acc, task) => acc + task.complexity, 0);

					const capacityColor = engineerCapacity > engineer.maxCapacity ? "red" : "green";

					return (
						<Card sx={{ p: 2, width: 400 }} key={engineer.name}>
							<Box mb={2}>
								<Typography variant="h1" fontSize={24}>
									{engineer.name}
								</Typography>
								<Divider sx={{ fontSize: 12 }} />
							</Box>

							<Typography variant="h4" fontSize={20} fontWeight={"bold"}>
								{`Capacity: `}
								<Box
									display="inline"
									color={capacityColor}
								>{`${engineerCapacity} / ${engineer.maxCapacity}`}</Box>
							</Typography>

							<Stack direction="row" sx={{ width: "100%" }}>
								<Stack sx={{ flexGrow: 1 }}>
									<Typography variant="h4" fontSize={20} fontWeight={"bold"}>
										Skills
									</Typography>
									<Typography variant="body1">{engineer.skills}</Typography>
								</Stack>
							</Stack>
						</Card>
					);
				})}
			</Stack>
		</Card>
	);
}

/**
 * A modal that displays the differences between two branches of a shared tree, and allows the user to accept or decline
 * the changes.
 *
 * @param props - Properties for the component
 */
function TaskGroupDiffModal(props: {
	isOpen: boolean;
	onClose: () => void;
	onAccept: () => void;
	onDecline: () => void;
	treeView: TreeView<typeof SharedTreeAppState>;
	differences: Difference[];
	newBranchTargetNode: SharedTreeTaskGroup;
}): JSX.Element {
	const { isOpen, onClose, onAccept, onDecline, treeView, differences, newBranchTargetNode } =
		props;

	return (
		<Dialog
			open={isOpen}
			onClose={onClose}
			aria-labelledby="modal-modal-title"
			aria-describedby="modal-modal-description"
			sx={{ overflow: "auto" }}
			maxWidth={"xl"}
			fullWidth={true}
			PaperProps={{
				sx: { background: "none" },
			}}
		>
			<Box
				sx={{
					maxWidth: "100%",
					background: "rgba(255, 255, 255, 0.38)",
					borderRadius: "16px",
					boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
					backdropFilter: "blur(12px);",
					"-webkit-backdrop-filter": "blur(12px)",
					border: "1px solid rgba(255, 255, 255, 0.3)",
					p: 2,
				}}
			>
				<Stack sx={{ my: 2 }} spacing={2}>
					<Typography variant="h2" textAlign={"center"}>
						Preview Of Copilot Changes
					</Typography>
					<Stack
						direction="row"
						spacing={2}
						justifyContent={"center"}
						sx={{ alignItems: "center" }}
					>
						<Typography variant="h6">Differences Color Key:</Typography>
						<DifferenceColorKeyEntry backgroundColor="#f7c3c3" text="Deleted" />
						<DifferenceColorKeyEntry backgroundColor="#cbf7d4" text="New" />
						<DifferenceColorKeyEntry backgroundColor="#a4dbfc" text="Changed" />
						<DifferenceColorKeyEntry backgroundColor="#e5c5fa" text="Moved" />
					</Stack>
					<Stack direction="row" spacing={2} sx={{ justifyContent: "center" }}>
						<Button
							variant="contained"
							color="success"
							sx={{ textTransform: "none" }}
							onClick={onAccept}
						>
							Accept Changes
						</Button>

						<Button
							variant="contained"
							color="error"
							sx={{ textTransform: "none" }}
							onClick={onDecline}
						>
							Decline Changes
						</Button>
					</Stack>
				</Stack>
				<TaskGroup
					treeView={treeView}
					sharedTreeTaskGroup={newBranchTargetNode}
					branchDifferences={differences}
				/>
			</Box>
		</Dialog>
	);
}

/**
 * Component that renders an entry describing what a given color key means, in the context of displaying
 * differences between two branches of a shared tree (different kinds of changes are rendered in different colors).
 *
 * @param props - Properties for the component
 */
function DifferenceColorKeyEntry(props: {
	backgroundColor: string;
	text: string;
}): JSX.Element {
	const { backgroundColor, text } = props;
	return (
		<Stack direction="row" alignItems="center" spacing={1}>
			<Box
				sx={{
					borderRadius: "50%",
					backgroundColor: { backgroundColor },
					width: 20,
					height: 20,
				}}
			/>
			<Typography variant="body1">{text}</Typography>
		</Stack>
	);
}
