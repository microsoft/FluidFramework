/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Experimental package for utilities that enable/simplify interaction with LLMs for apps based on SharedTree.
 *
 * See {@link https://github.com/microsoft/FluidFramework/tree/main/packages/framework/ai-collab#readme | README.md }
 * for an overview of the package.
 *
 * @packageDocumentation
 */

export { aiCollab } from "./aiCollab.js";
export type {
	AiCollabErrorResponse,
	AiCollabOptions,
	AiCollabSuccessResponse,
	DebugEvent,
	DebugEventLogHandler,
	EventFlowDebugEvent,
	OpenAiClientOptions,
	TokenLimits,
	TokenUsage,
} from "./aiCollabApi.js";
export type {
	ArrayRangeRemoveDiff,
	ArraySingleRemoveDiff,
	Diff,
	DiffBase,
	InsertDiff,
	ModifyDiff,
	MoveDiff,
	MoveRangeDiff,
	MoveSingleDiff,
	NodePath,
	RemoveDiff,
	RemoveNodeDiff,
} from "./diffTypes.js";
export type {
	ApplyEditFailure,
	ApplyEditSuccess,
	CoreEventLoopCompleted,
	CoreEventLoopStarted,
	EventFlowDebugName,
	EventFlowDebugNames,
	FinalReviewCompleted,
	FinalReviewStarted,
	GenerateTreeEditCompleted,
	GenerateTreeEditStarted,
	LlmApiCallDebugEvent,
	LlmTreeEdit,
	PlanningPromptCompleted,
	PlanningPromptStarted,
} from "./explicit-strategy/index.js";
export {
	createMergableDiffSeries,
	createMergableIdDiffSeries,
	type Difference,
	type DifferenceChange,
	type DifferenceCreate,
	type DifferenceMove,
	type DifferenceRemove,
	type ObjectPath,
	type Options,
	SharedTreeBranchManager,
	sharedTreeDiff,
	sharedTreeTraverse,
} from "./implicit-strategy/index.js";
