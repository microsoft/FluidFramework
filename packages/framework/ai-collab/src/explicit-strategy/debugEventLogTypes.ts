/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DebugEvent } from "../aiCollabApi.js";

import type { TreeEdit } from "./agentEditTypes.js";

// Planning Prompt Debug events: ------------------------------------------------------

/**
 * @alpha
 */
export interface PlanningPromptInitiatedDebugEvent extends DebugEvent {
	eventName: "GENERATE_PLANNING_PROMPT_LLM";
	eventFlowStatus: "INITIATED";
}

/**
 * @alpha
 */
export interface PlanningPromptCompletedDebugEvent extends DebugEvent {
	eventName: "GENERATE_PLANNING_PROMPT_LLM";
	eventFlowStatus: "COMPLETED";
	requestOutcome: "success" | "failure";
	llmGeneratedPlan: string | undefined;
}

// Editing System prompt Debug events: ------------------------------------------------

/**
 * A debug event marking the initiation of the flow for prompting an LLM to generate an edit to a SharedTree.
 * @alpha
 */
export interface GenerateTreeEditInitiatedDebugEvent extends DebugEvent {
	eventName: "GENERATE_TREE_EDIT_LLM";
	eventFlowStatus: "INITIATED";
}

/**
 * A debug event marking the completion of the flow for prompting an LLM to generate an edit to a SharedTree.
 * @alpha
 */
export interface GenerateTreeEditCompletedDebugEvent extends DebugEvent {
	eventName: "GENERATE_TREE_EDIT_LLM";
	eventFlowStatus: "COMPLETED";
	requestOutcome: "success" | "failure";
	/**
	 * This will be null if the LLM decides no more edits are necessary.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	llmGeneratedEdit?: TreeEdit | null;
}

// Apply Edit Debug events: ----------------------------------------------------------

/**
 * A debug event marking the successful application of an LLM generated edit to a SharedTree.
 * @alpha
 */
export interface ApplyEditSuccessDebugEvent extends DebugEvent {
	eventName: "APPLIED_EDIT_SUCCESS";
	edit: TreeEdit;
}

/**
 * A debug event marking the failure of applying an LLM generated edit to a SharedTree.
 * @alpha
 */
export interface ApplyEditFailureDebugEvent extends DebugEvent {
	eventName: "APPLIED_EDIT_FAILURE";
	edit: TreeEdit;
	errorMessage: string;
	sequentialErrorCount: number;
}

// Generate Final Review Debug events: ----------------------------------------------------------

/**
 * A debug event marking the initiation of the flow for prompting an LLM to complete a final review of its edits
 * and determine whether the user's goal was accomplished.
 * @alpha
 */
export interface FinalReviewInitiatedDebugEvent extends DebugEvent {
	eventName: "FINAL_REVIEW_LLM";
	eventFlowStatus: "INITIATED";
	prompt: string;
}

/**
 * A debug event marking the end of the flow for prompting an LLM to complete a final review of its edits
 * and determine whether the user's goal was accomplished.
 * @alpha
 */
export interface FinalReviewCompletedDebugEvent extends DebugEvent {
	eventName: "FINAL_REVIEW_LLM";
	eventFlowStatus: "COMPLETED";
	prompt: string;
	status: "success" | "failure";
	llmReviewResponse?: {
		goalAccomplished: "yes" | "no";
	};
}

// Raw LLM Request/Response Debug Events ----------------------------------------------------------

/**
 * A debug event for an API call directly to a LLM.
 * @alpha
 */
export interface LlmApiCallDebugEvent extends DebugEvent {
	eventName: "LLM_API_CALL";
	modelName: string;
	requestParams: unknown;
	response: unknown;
	tokenUsage?: {
		promptTokens: number;
		completionTokens: number;
	};
}
