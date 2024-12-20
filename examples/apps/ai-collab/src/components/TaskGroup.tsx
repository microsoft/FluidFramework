/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	aiCollab,
	type AiCollabErrorResponse,
	type AiCollabSuccessResponse,
	type Difference,
	SharedTreeBranchManager,
} from "@fluidframework/ai-collab/alpha";
import {
	CommitKind,
	RevertibleStatus,
	TreeAlpha,
	type CommitMetadata,
	type Revertible,
	type RevertibleFactory,
	type TreeBranch,
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
import React, { useEffect, useState } from "react";

import { TaskCard } from "./TaskCard";

// eslint-disable-next-line import/no-internal-modules
import { getOpenAiClient } from "@/infra/openAiClient";
import {
	aiCollabLlmTreeNodeValidator,
	SharedTreeAppState,
	SharedTreeTaskGroup,
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
		originalBranch: TreeViewAlpha<typeof SharedTreeAppState>;
		aiCollabBranch: TreeViewAlpha<typeof SharedTreeAppState>;
		newBranchTargetNode: SharedTreeTaskGroup;
	}>();

	const [undoStack, setUndoStack] = useState<Revertible[]>([]);
	const [redoStack, setRedoStack] = useState<Revertible[]>([]);

	useSharedTreeRerender({ sharedTreeNode: props.sharedTreeTaskGroup, logId: "TaskGroup" });

	/**
	 * Create undo and redo stacks of {@link Revertible}.
	 */
	useEffect(() => {
		function onRevertibleDisposed(disposed: Revertible): void {
			const redoIndex = redoStack.indexOf(disposed);
			if (redoIndex === -1) {
				const undoIndex = undoStack.indexOf(disposed);
				if (undoIndex !== -1) {
					setUndoStack((currUndoStack) => {
						const newUndoStack = [...currUndoStack];
						newUndoStack.splice(undoIndex, 1);
						return newUndoStack;
					});
				}
			} else {
				setRedoStack((currRedostack) => {
					const newRedoStack = [...currRedostack];
					newRedoStack.splice(redoIndex, 1);
					return newRedoStack;
				});
			}
		}

		/**
		 * Instead of application developer manually managing the life cycle of the {@link Revertible} instances,
		 * example app stores up to `MAX_STACK_SIZE` number of {@link Revertible} instances in each of the undo and redo stacks.
		 * When the stack size exceeds `MAX_STACK_SIZE`, the oldest {@link Revertible} instance is disposed.
		 * @param stack - The stack that the {@link Revertible} instance is being added to.
		 * @param setstack - The setter function for the primary stack.
		 */
		function trimStackToMaxSize(stack: Revertible[]): Revertible[] {
			const MAX_STACK_SIZE = 50;

			if (stack.length <= MAX_STACK_SIZE) {
				return stack;
			}

			const oldestRevertible = stack[0];
			if (oldestRevertible?.status !== RevertibleStatus.Disposed) {
				oldestRevertible?.dispose();
			}

			return stack.slice(1);
		}

		/**
		 * Event handler that manages the undo/redo functionality for tree view commits.
		 *
		 * @param commit - Metadata about the commit being applied
		 * @param getRevertible - Optional factory function that creates a Revertible object
		 *
		 * This handler:
		 * 1. Creates a Revertible object when a commit is applied
		 * 2. Adds the Revertible to either the undo or redo stack based on the commit type
		 * 3. Maintains a maximum stack size (defined in `maintainStackSize` function)
		 *
		 * The Revertible objects allow operations to be undone/redone, with automatic cleanup
		 * handled by the onRevertibleDisposed callback.
		 *
		 * @returns An event listener cleanup function
		 */
		const unsubscribeFromCommitAppliedEvent = props.treeView.events.on(
			"commitApplied",
			(commit: CommitMetadata, getRevertible?: RevertibleFactory) => {
				if (getRevertible !== undefined) {
					const revertible = getRevertible(onRevertibleDisposed);
					if (commit.kind === CommitKind.Undo) {
						const newRedoStack = trimStackToMaxSize([...redoStack, revertible]);
						setRedoStack(newRedoStack);
					} else {
						const newUndoStack = trimStackToMaxSize([...undoStack, revertible]);
						setUndoStack(newUndoStack);
					}
				}
			},
		);

		return () => {
			unsubscribeFromCommitAppliedEvent();
		};
	}, [props.treeView.events, undoStack, redoStack]);

	/**
	 * Helper function for ai collaboration which creates a new branch from the current {@link SharedTreeAppState}
	 * as well as find the matching {@link SharedTreeTaskGroup} intended to be worked on within the new branch.
	 */
	const getNewSharedTreeBranchAndTaskGroup = (
		sharedTreeAppState: SharedTreeAppState,
		taskGroup: SharedTreeTaskGroup,
	): {
		currentBranch: TreeBranch & TreeViewAlpha<typeof SharedTreeAppState>;
		newBranchTree: TreeBranch & TreeViewAlpha<typeof SharedTreeAppState>;
		newBranchTaskGroup: SharedTreeTaskGroup;
	} => {
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

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const newBranchTaskGroup = newBranchTree.root.taskGroups.find(
			(_taskGroup) => _taskGroup.id === taskGroup.id,
		)!;

		return { currentBranch, newBranchTree, newBranchTaskGroup };
	};

	/**
	 * Executes Ai Collaboration for this task group based on the users request.
	 */
	const handleAiCollab = async (userRequest: string): Promise<void> => {
		setIsAiTaskRunning(true);
		enqueueSnackbar(`Copilot: I'm working on your request - "${userRequest}"`, {
			variant: "info",
			autoHideDuration: 5000,
		});

		try {
			// 1. Get the current branch, the new branch and associated task group to be used for ai collaboration
			const { currentBranch, newBranchTree, newBranchTaskGroup } =
				getNewSharedTreeBranchAndTaskGroup(props.treeView.root, props.sharedTreeTaskGroup);
			console.log("ai-collab Branch Task Group BEFORE:", { ...newBranchTaskGroup });

			// 2. execute the ai collaboration
			const response: AiCollabSuccessResponse | AiCollabErrorResponse = await aiCollab({
				openAI: {
					client: getOpenAiClient(),
					modelName: "gpt-4o",
				},
				treeNode: newBranchTaskGroup,
				prompt: {
					systemRoleContext:
						"You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks.",
					userAsk: userRequest,
				},
				limiters: {
					maxModelCalls: 30,
				},
				planningStep: true,
				finalReviewStep: false,
				dumpDebugLog: true,
				validator: aiCollabLlmTreeNodeValidator,
			});

			// 3. Handle the response from the ai collaboration
			if (response.status !== "success") {
				throw new Error(response.errorMessage);
			}

			const branchManager = new SharedTreeBranchManager({
				nodeIdAttributeName: "id",
			});

			const taskGroupDifferences = branchManager.compare(
				props.sharedTreeTaskGroup as unknown as Record<string, unknown>,
				newBranchTaskGroup as unknown as Record<string, unknown>,
			);

			console.log("ai-collab Branch Task Group AFTER:", { ...newBranchTaskGroup });
			console.log("ai-collab Branch Task Group differences:", taskGroupDifferences);

			setLlmBranchData({
				differences: taskGroupDifferences,
				originalBranch: currentBranch,
				aiCollabBranch: newBranchTree,
				newBranchTargetNode: newBranchTaskGroup,
			});
			setIsDiffModalOpen(true);
			enqueueSnackbar(`Copilot: I've completed your request - "${userRequest}"`, {
				variant: "success",
				autoHideDuration: 5000,
			});
		} catch (error) {
			enqueueSnackbar(
				`Copilot: Something went wrong processing your request - ${error instanceof Error ? error.message : "unknown error"}`,
				{
					variant: "error",
					autoHideDuration: 5000,
				},
			);
		} finally {
			setIsAiTaskRunning(false);
			setPopoverAnchor(undefined);
		}
	};

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
							llmBranchData.originalBranch.merge(llmBranchData.aiCollabBranch);
							setIsDiffModalOpen(false);
							setLlmBranchData(undefined);
							setPopoverAnchor(undefined);
						}}
						onDecline={() => {
							setIsDiffModalOpen(false);
							setLlmBranchData(undefined);
							setPopoverAnchor(undefined);
						}}
						treeView={llmBranchData.aiCollabBranch}
						differences={llmBranchData.differences}
						newBranchTargetNode={llmBranchData.newBranchTargetNode}
					></TaskGroupDiffModal>
				)}

				{undoStack.length > 0 && (
					<Button
						variant="contained"
						color="error"
						onClick={() => {
							// Getting the revertible before removing it from the undo stack allows the the item to remains in the stack if `revert()` fails.
							const revertible = undoStack[undoStack.length - 1];
							revertible?.revert();
							undoStack.pop();
						}}
					>
						Undo
					</Button>
				)}

				{redoStack.length > 0 && (
					<Button
						variant="contained"
						color="info"
						onClick={() => {
							// Getting the revertible before removing it from the redo stack allows the the item to remains in the stack if `revert()` fails.
							const revertible = redoStack[redoStack.length - 1];
							revertible?.revert();
							redoStack.pop();
						}}
					>
						Redo
					</Button>
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

								await handleAiCollab(query);
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
							sharedTreeBranch={props.treeView}
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
