/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from "uuid";

import type { DebugEvent, EventFlowDebugEvent } from "../aiCollabApi.js";

import type { TreeEdit } from "./agentEditTypes.js";

/**
 * A debug event for signaling the start of the ai-collab's core event loop.
 * Which makes various calls to the LLM to eventually apply edits to the users SharedTree which
 * accomplish the user's provided goal.
 * @alpha
 */
export interface CoreEventLoopStartedDebugEvent extends EventFlowDebugEvent {
	eventName: "CORE_EVENT_LOOP_STARTED";
	eventFlowName: "CORE_EVENT_LOOP";
	eventFlowStatus: "STARTED";
}

/**
 * A debug event for signaling the end of the ai-collab's core event loop.
 * There could be various reasons for the event loop to end, early exits and failures
 * which should be captured in the status and failureReason fields.
 * @alpha
 */
export interface CoreEventLoopCompletedDebugEvent extends EventFlowDebugEvent {
	eventName: "CORE_EVENT_LOOP_COMPLETED";
	eventFlowName: "CORE_EVENT_LOOP";
	eventFlowStatus: "COMPLETED";
	status: "success" | "failure";
	failureReason?: string;
	errorMessage?: string;
}

// Planning Prompt Debug events: ------------------------------------------------------

/**
 * A debug event marking the initiation of the flow for prompting an LLM to generate a plan for accomplishing the user's goal.
 * @alpha
 */
export interface PlanningPromptStartedDebugEvent extends EventFlowDebugEvent {
	eventName: "GENERATE_PLANNING_PROMPT_STARTED";
	eventFlowName: "GENERATE_PLANNING_PROMPT";
	eventFlowStatus: "STARTED";
}

/**
 * A debug event marking the completion of the flow for prompting an LLM to generate a plan for accomplishing the user's goal.
 * @alpha
 */
export interface PlanningPromptCompletedDebugEvent extends EventFlowDebugEvent {
	eventName: "GENERATE_PLANNING_PROMPT_COMPLETED";
	eventFlowName: "GENERATE_PLANNING_PROMPT";
	eventFlowStatus: "COMPLETED";
	/**
	 * Whether the response produced by the LLM was an expected response.
	 * In the event that the LLM fails to respond in an expected way, despite the API call to the LLM itself being successful, then this will be "failure".
	 *
	 * For now, this case is boxed to the LLM returning undefined as a response when it should have returned something. But in the future this could expand
	 * to things such as invalid json.
	 */
	requestOutcome: "success" | "failure";
	llmGeneratedPlan: string | undefined;
}

// Editing System prompt Debug events: ------------------------------------------------

/**
 * A debug event marking the initiation of the flow for prompting an LLM to generate an edit to a SharedTree.
 * @alpha
 */
export interface GenerateTreeEditStartedDebugEvent extends EventFlowDebugEvent {
	eventName: "GENERATE_TREE_EDIT_STARTED";
	eventFlowName: "GENERATE_TREE_EDIT";
	eventFlowStatus: "STARTED";
	llmPrompt: string;
}

/**
 * A debug event marking the completion of the flow for prompting an LLM to generate an edit to a SharedTree.
 * @alpha
 */
export interface GenerateTreeEditCompletedDebugEvent extends EventFlowDebugEvent {
	eventName: "GENERATE_TREE_EDIT_COMPLETED";
	eventFlowName: "GENERATE_TREE_EDIT";
	eventFlowStatus: "COMPLETED";
	/**
	 * Whether the response produced by the LLM is an expected response.
	 * In the event that the LLM fails to respond in an expected way, despite the API call to the LLM itself being successful, then this will be "failure".
	 *
	 * For now, this case is boxed to the LLM returning undefined as a response when it should have returned something. But in the future this could expand
	 * to things such as invalid json.
	 */
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
	eventFlowTraceId?: string;
	edit: TreeEdit;
}

/**
 * A debug event marking the failure of applying an LLM generated edit to a SharedTree.
 * @alpha
 */
export interface ApplyEditFailureDebugEvent extends DebugEvent {
	eventName: "APPLIED_EDIT_FAILURE";
	eventFlowTraceId?: string;
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
export interface FinalReviewStartedDebugEvent extends EventFlowDebugEvent {
	eventName: "FINAL_REVIEW_STARTED";
	eventFlowName: "FINAL_REVIEW";
	eventFlowStatus: "STARTED";
	/**
	 * The prompt sent to the LLM to complete its final review of the edits its made.
	 */
	llmPrompt: string;
}

/**
 * A debug event marking the end of the flow for prompting an LLM to complete a final review of its edits
 * and determine whether the user's goal was accomplished.
 * @alpha
 */
export interface FinalReviewCompletedDebugEvent extends EventFlowDebugEvent {
	eventName: "FINAL_REVIEW_COMPLETED";
	eventFlowName: "FINAL_REVIEW";
	eventFlowStatus: "COMPLETED";
	/**
	 * Whether the response produced by the LLM was an expected response.
	 * In the event that the LLM fails to respond in an expected way, despite the API call to the LLM itself being successful, then this will be "failure".
	 *
	 * For now, this case is boxed to the LLM returning undefined as a response when it should have returned something. But in the future this could expand
	 * to things such as invalid json.
	 */
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
	triggeringEventFlowName?: "GENERATE_PLANNING_PROMPT" | "GENERATE_TREE_EDIT" | "FINAL_REVIEW";
	eventFlowTraceId?: string;
	modelName: string;
	requestParams: unknown;
	response: unknown;
	tokenUsage?: {
		promptTokens: number;
		completionTokens: number;
	};
}

/**
 * Helper funciton to help create a consistent method for producing a base {@link DebugEvent}.
 */
export function generateDebugEvent(traceId?: string): DebugEvent {
	return {
		id: uuidv4(),
		traceId,
		timestamp: new Date().toISOString(),
	} as const;
}
