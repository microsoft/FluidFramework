/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SharedTree,
	SchemaFactory,
	TreeViewConfiguration,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { OpenAI } from "openai";

import { aiCollab } from "../../aiCollab.js";
import type { DebugEvent, EventFlowDebugEvent } from "../../aiCollabApi.js";
import type {
	ApplyEditFailureDebugEvent,
	ApplyEditSuccessDebugEvent,
	// ApplyEditSuccessDebugEvent,
	FinalReviewCompletedDebugEvent,
	FinalReviewStartedDebugEvent,
	GenerateTreeEditCompletedDebugEvent,
	GenerateTreeEditStartedDebugEvent,
	// GenerateTreeEditCompletedDebugEvent,
	// GenerateTreeEditStartedDebugEvent,
	LlmApiCallDebugEvent,
	PlanningPromptCompletedDebugEvent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/debugEventLogTypes.js";

const sf = new SchemaFactory("TestApp");
class TestAppSchema extends sf.object("TestAppSchema", {
	title: sf.string,
	tasks: sf.array(
		sf.object("Task", {
			title: sf.string,
			description: sf.string,
		}),
	),
}) {}

const factory = SharedTree.getFactory();

const OPENAI_API_KEY = ""; // DON'T COMMIT THIS

describe.skip("Debug Log Works as expected", () => {
	it("Outputs debug events in expected expected order and form", async () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
		view.initialize({
			title: "This is a group of tasks",
			tasks: [
				{
					title: "Task 1",
					description: "This is the first task",
				},
				{
					title: "Task 2",
					description: "This is the second task",
				},
			],
		});

		const debugLog: DebugEvent[] = [];

		const response = await aiCollab({
			openAI: {
				client: new OpenAI({
					apiKey: OPENAI_API_KEY,
				}),
				modelName: "gpt-4o",
			},
			treeNode: view.root,
			prompt: {
				systemRoleContext: "You're a helpful AI assistant",
				userAsk:
					"Change the title to 'Hello World', remove the existing tasks and then create two new placeholder tasks",
			},
			limiters: {
				maxModelCalls: 10,
			},
			debugEventLogHandler: (event) => {
				// eslint-disable-next-line unicorn/no-null
				console.log(`Received event: ${JSON.stringify(event, null, 2)}`);
				debugLog.push(event);
			},
			planningStep: true,
			finalReviewStep: true,
		});

		debugger;

		assert.strictEqual(response.status, "success");
		assert.strictEqual(debugLog.length > 0, true);

		const assertDebugEventIsValid = (event: DebugEvent | undefined): void => {
			assert(event !== undefined);
			assert(event.id !== undefined);
			assert(event.timestamp !== undefined);
			assert(event.traceId !== undefined);
		};

		let expectedTraceId: string | undefined;
		for (const debugEvent of debugLog) {
			if (expectedTraceId === undefined) {
				expectedTraceId = debugEvent.traceId;
			} else {
				// This ensures all events have the same traceId
				assert.strictEqual(debugEvent.traceId, expectedTraceId);
			}
			assertDebugEventIsValid(debugEvent);
		}

		assert.deepStrictEqual(debugLog[0], {
			id: debugLog[0]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[0]?.timestamp,
			eventName: "CORE_EVENT_LOOP_STARTED",
			eventFlowName: "CORE_EVENT_LOOP",
			eventFlowStatus: "STARTED",
		});

		// ---------------------- Generate Planning Prompt assertions ----------------------

		assert.deepStrictEqual(debugLog[1], {
			id: debugLog[1]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[1]?.timestamp,
			eventName: "GENERATE_PLANNING_PROMPT_STARTED",
			eventFlowName: "GENERATE_PLANNING_PROMPT",
			eventFlowStatus: "STARTED",
			eventFlowTraceId: (debugLog[1] as EventFlowDebugEvent)?.eventFlowTraceId as string,
		});
		const expectedPlanningPromptEventFlowTraceId = (debugLog[1] as EventFlowDebugEvent)
			?.eventFlowTraceId as string;
		assert.strictEqual(expectedPlanningPromptEventFlowTraceId !== undefined, true);
		// todo - assert other fields are not undefined
		assert.deepStrictEqual(debugLog[2], {
			id: debugLog[2]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[2]?.timestamp,
			triggeringEventFlowName: "GENERATE_PLANNING_PROMPT",
			eventFlowTraceId: expectedPlanningPromptEventFlowTraceId,
			eventName: "LLM_API_CALL",
			modelName: "gpt-4o",
			requestParams: (debugLog[2] as LlmApiCallDebugEvent)?.requestParams,
			response: (debugLog[2] as LlmApiCallDebugEvent)?.response,
			tokenUsage: (debugLog[2] as LlmApiCallDebugEvent)?.tokenUsage,
		});

		// todo - assert other fields are not undefined
		assert.deepStrictEqual(debugLog[3], {
			id: debugLog[3]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[3]?.timestamp,
			eventName: "GENERATE_PLANNING_PROMPT_COMPLETED",
			eventFlowName: "GENERATE_PLANNING_PROMPT",
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: expectedPlanningPromptEventFlowTraceId,
			requestOutcome: "success",
			llmGeneratedPlan: (debugLog[3] as PlanningPromptCompletedDebugEvent)?.llmGeneratedPlan,
		});
		assert.strictEqual(
			(debugLog[3] as PlanningPromptCompletedDebugEvent)?.llmGeneratedPlan !== undefined,
			true,
		);

		// ---------------------------------------------------------------------------

		// ---------------------- Generate Tree Edit assertions ----------------------
		const finalReviewIndex = debugLog.findIndex(
			(event) => event.eventName === "FINAL_REVIEW_STARTED",
		);
		assert.strictEqual(finalReviewIndex > -1, true);

		const eventFlowTraceIdToEvents: Record<string, DebugEvent[]> = {};
		for (let i = 4; i < finalReviewIndex; i++) {
			const traceId = (debugLog[i] as unknown as EventFlowDebugEvent)
				.eventFlowTraceId as string;
			if (eventFlowTraceIdToEvents[traceId] === undefined) {
				eventFlowTraceIdToEvents[traceId] = [debugLog[i] as EventFlowDebugEvent];
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				eventFlowTraceIdToEvents[traceId]!.push(debugLog[i] as EventFlowDebugEvent);
			}
		}

		for (const eventFlowTraceId of Object.keys(eventFlowTraceIdToEvents)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const events = eventFlowTraceIdToEvents[eventFlowTraceId]!;

			const generateTreeEditStartedEvent: GenerateTreeEditStartedDebugEvent =
				events[0] as GenerateTreeEditStartedDebugEvent;
			const expectedEventFlowTraceId = generateTreeEditStartedEvent.eventFlowTraceId as string;
			assert.strictEqual(expectedEventFlowTraceId !== undefined, true);

			assert.deepStrictEqual(generateTreeEditStartedEvent, {
				id: generateTreeEditStartedEvent.id,
				traceId: expectedTraceId,
				timestamp: generateTreeEditStartedEvent.timestamp,
				eventName: "GENERATE_TREE_EDIT_STARTED",
				eventFlowName: "GENERATE_TREE_EDIT",
				eventFlowStatus: "STARTED",
				eventFlowTraceId: expectedEventFlowTraceId,
				llmPrompt: generateTreeEditStartedEvent.llmPrompt,
			});

			const llmApiCallEvent: LlmApiCallDebugEvent = events[1] as LlmApiCallDebugEvent;
			assert.deepStrictEqual(llmApiCallEvent, {
				id: llmApiCallEvent.id,
				traceId: expectedTraceId,
				timestamp: llmApiCallEvent.timestamp,
				eventName: "LLM_API_CALL",
				triggeringEventFlowName: "GENERATE_TREE_EDIT",
				eventFlowTraceId: expectedEventFlowTraceId,
				modelName: "gpt-4o",
				requestParams: llmApiCallEvent.requestParams,
				response: llmApiCallEvent.response,
				tokenUsage: llmApiCallEvent.tokenUsage,
			});

			const generateTreeEditCompletedEvent: GenerateTreeEditCompletedDebugEvent =
				events[2] as GenerateTreeEditCompletedDebugEvent;

			assert.deepStrictEqual(generateTreeEditCompletedEvent, {
				id: generateTreeEditCompletedEvent.id,
				traceId: expectedTraceId,
				timestamp: generateTreeEditCompletedEvent.timestamp,
				eventName: "GENERATE_TREE_EDIT_COMPLETED",
				eventFlowName: "GENERATE_TREE_EDIT",
				eventFlowStatus: "COMPLETED",
				eventFlowTraceId: expectedEventFlowTraceId,
				requestOutcome: "success",
				llmGeneratedEdit: generateTreeEditCompletedEvent.llmGeneratedEdit,
			});

			// If the LLM generates null as its edit, this means it thinks no more edits are necessary.
			if (generateTreeEditCompletedEvent.llmGeneratedEdit === null) {
				continue;
			}

			const applyEditEvent = events[3] as unknown as
				| ApplyEditSuccessDebugEvent
				| ApplyEditFailureDebugEvent;

			const applyEditEventName = applyEditEvent.eventName;
			assert.strictEqual(
				applyEditEventName === "APPLIED_EDIT_SUCCESS" ||
					applyEditEventName === "APPLIED_EDIT_FAILURE",
				true,
			);

			assert.deepStrictEqual(applyEditEvent, {
				id: applyEditEvent.id,
				traceId: expectedTraceId,
				timestamp: applyEditEvent.timestamp,
				eventName: applyEditEvent.eventName,
				eventFlowTraceId: expectedEventFlowTraceId,
				edit: applyEditEvent.edit,
			});
		}

		debugger;

		// --------------------------------------------------------------------------

		// ---------------------- Final Review step assertions ----------------------

		assert.deepStrictEqual(debugLog[finalReviewIndex], {
			id: debugLog[finalReviewIndex]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[finalReviewIndex]?.timestamp,
			eventName: "FINAL_REVIEW_STARTED",
			eventFlowName: "FINAL_REVIEW",
			eventFlowStatus: "STARTED",
			eventFlowTraceId: (debugLog[finalReviewIndex] as EventFlowDebugEvent)
				?.eventFlowTraceId as string,
			llmPrompt: (debugLog[finalReviewIndex] as FinalReviewStartedDebugEvent)?.llmPrompt,
		});
		const expectedFinalReviewEventFlowTraceId = (
			debugLog[finalReviewIndex] as EventFlowDebugEvent
		)?.eventFlowTraceId as string;
		assert.strictEqual(expectedFinalReviewEventFlowTraceId !== undefined, true);

		const expectedFinalReviewLLmApiCallIndex = finalReviewIndex + 1;
		assert.deepStrictEqual(debugLog[expectedFinalReviewLLmApiCallIndex], {
			id: debugLog[expectedFinalReviewLLmApiCallIndex]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[expectedFinalReviewLLmApiCallIndex]?.timestamp,
			eventName: "LLM_API_CALL",
			triggeringEventFlowName: "FINAL_REVIEW",
			eventFlowTraceId: expectedFinalReviewEventFlowTraceId,
			modelName: "gpt-4o",
			requestParams: (debugLog[expectedFinalReviewLLmApiCallIndex] as LlmApiCallDebugEvent)
				?.requestParams,
			response: (debugLog[expectedFinalReviewLLmApiCallIndex] as LlmApiCallDebugEvent)
				?.response,
			tokenUsage: (debugLog[expectedFinalReviewLLmApiCallIndex] as LlmApiCallDebugEvent)
				?.tokenUsage,
		});

		const finalReviewCompletedExpectedIndex = finalReviewIndex + 2;
		assert.deepStrictEqual(debugLog[finalReviewCompletedExpectedIndex], {
			id: debugLog[finalReviewCompletedExpectedIndex]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[finalReviewCompletedExpectedIndex]?.timestamp,
			eventName: "FINAL_REVIEW_COMPLETED",
			eventFlowName: "FINAL_REVIEW",
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: expectedFinalReviewEventFlowTraceId,
			status: "success",
			llmReviewResponse: (
				debugLog[finalReviewCompletedExpectedIndex] as FinalReviewCompletedDebugEvent
			)?.llmReviewResponse,
		});

		// ------------------------------------------------------------------------

		assert.deepStrictEqual(debugLog[debugLog.length - 1], {
			id: debugLog[debugLog.length - 1]?.id,
			traceId: expectedTraceId,
			timestamp: debugLog[debugLog.length - 1]?.timestamp,
			eventName: "CORE_EVENT_LOOP_COMPLETED",
			eventFlowName: "CORE_EVENT_LOOP",
			eventFlowStatus: "COMPLETED",
			status: "success",
		});
	}).timeout(20000);
});
