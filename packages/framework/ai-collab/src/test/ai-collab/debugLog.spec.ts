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
	type TreeView,
	type ITree,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import { OpenAI } from "openai";

import { aiCollab } from "../../aiCollab.js";
import type {
	AiCollabErrorResponse,
	AiCollabSuccessResponse,
	DebugEvent,
	EventFlowDebugEvent,
} from "../../aiCollabApi.js";
import {
	type ApplyEditFailure,
	type ApplyEditSuccess,
	type CoreEventLoopStarted,
	type CoreEventLoopCompleted,
	type FinalReviewCompleted,
	type FinalReviewStarted,
	type GenerateTreeEditCompleted,
	type GenerateTreeEditStarted,
	type LlmApiCallDebugEvent,
	type PlanningPromptCompleted,
	type PlanningPromptStarted,
	EventFlowDebugNames,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/debugEvents.js";

const sf = new SchemaFactory("TestApp");
class TestAppSchema extends sf.object("TestAppSchema", {
	title: SchemaFactory.string,
	tasks: sf.array(
		sf.object("Task", {
			title: sf.string,
			description: sf.string,
		}),
	),
}) {}

const factory = SharedTree.getFactory();

const OPENAI_API_KEY = ""; // DON'T COMMIT THIS

// This test suite is currently skipped because it requires an OpenAI API key and actual LLM API calls to run.
// In the future, we will revisit this test suite to mock the OpenAI calls.

// This test suite is meant to test the debug log events that are generated during an ai-collab execution
// One stream of debug logs is created by making a single ai-collab() function call. Then, different segments
// of the resulting list of debug events is analyzed to ensure that the events are in the expected order and contain the expected information.
describe.skip("Debug Log Works as expected", () => {
	let tree: ITree;
	let view: TreeView<typeof TestAppSchema>;
	const debugLog: DebugEvent[] = [];
	let aiCollabResponse: AiCollabSuccessResponse | AiCollabErrorResponse;

	before(async function () {
		this.timeout(20000);
		tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		view = tree.viewWith(new TreeViewConfiguration({ schema: TestAppSchema }));
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

		aiCollabResponse = await aiCollab({
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
			// Notice this is our naive implementation of a debug log handler. We can use this to assert the events are as expected.
			debugEventLogHandler: (event) => {
				console.log(`Received event: ${event.eventName}`);
				if (
					event.eventName === "APPLIED_EDIT_SUCCESS" ||
					event.eventName === "APPLIED_EDIT_FAILURE"
				) {
					console.log(
						`${
							event.eventName === "APPLIED_EDIT_SUCCESS"
								? "Succesfully applied"
								: "Failed to appply"
						} tree edit: ${JSON.stringify(
							(event as unknown as ApplyEditSuccess).edit,
							undefined,
							2,
						)}`,
					);
				}
				debugLog.push(event);
			},
			planningStep: true,
			finalReviewStep: true,
		});

		// confirming we get a successful response with a filled debug log.
		assert.strictEqual(aiCollabResponse.status, "success");
		assert.strictEqual(debugLog.length > 0, true);
	});

	const assertDebugEventCoreInterfaceIsValid = (event: DebugEvent | undefined): void => {
		assert(event !== undefined);
		assert(event.id !== undefined);
		assert(event.timestamp !== undefined);
		assert(event.traceId !== undefined);
	};

	it("Contains the core event loop started and ended events", () => {
		const expectedTraceId = (debugLog[0] as DebugEvent).traceId; // All debug events from the same execution should have the same trace id
		assert(expectedTraceId !== undefined);

		const debugEvent1: CoreEventLoopStarted = debugLog[0] as CoreEventLoopStarted;

		assertDebugEventCoreInterfaceIsValid(debugEvent1);
		assert.deepStrictEqual(debugLog[0], {
			id: debugEvent1.id,
			traceId: expectedTraceId,
			timestamp: debugEvent1.timestamp,
			eventName: "CORE_EVENT_LOOP_STARTED",
			eventFlowName: "CORE_EVENT_LOOP",
			eventFlowStatus: "STARTED",
			eventFlowTraceId: debugEvent1.eventFlowTraceId,
		} satisfies CoreEventLoopStarted);
		assert(debugEvent1.eventFlowTraceId !== undefined);

		const debugEvent2: CoreEventLoopCompleted = debugLog[
			debugLog.length - 1
		] as CoreEventLoopCompleted;
		assert.deepStrictEqual(debugEvent2, {
			id: debugEvent2.id,
			traceId: expectedTraceId,
			timestamp: debugEvent2.timestamp,
			eventName: "CORE_EVENT_LOOP_COMPLETED",
			eventFlowName: "CORE_EVENT_LOOP",
			eventFlowStatus: "COMPLETED",
			status: "success",
			eventFlowTraceId: debugEvent1.eventFlowTraceId,
		} satisfies CoreEventLoopCompleted);

		assertDebugEventCoreInterfaceIsValid(debugEvent2);
	});

	it("Has generate planning prompt event flows and in the expected order with matching eventFlowTraceId", () => {
		const expectedTraceId = (debugLog[0] as DebugEvent).traceId; // All debug events from the same execution should have the same trace id
		assert(expectedTraceId !== undefined);

		const debugEvent1: PlanningPromptStarted = debugLog[1] as PlanningPromptStarted;
		assertDebugEventCoreInterfaceIsValid(debugEvent1);
		assert.deepStrictEqual(debugLog[1], {
			id: debugEvent1.id,
			traceId: expectedTraceId,
			timestamp: debugEvent1.timestamp,
			eventName: "GENERATE_PLANNING_PROMPT_STARTED",
			eventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
			eventFlowStatus: "STARTED",
			eventFlowTraceId: debugEvent1.eventFlowTraceId,
		} satisfies PlanningPromptStarted);
		const expectedPlanningPromptEventFlowTraceId = debugEvent1.eventFlowTraceId;
		assert(expectedPlanningPromptEventFlowTraceId !== undefined);

		const expectedPlanningPromptLLmApiCall: LlmApiCallDebugEvent =
			debugLog[2] as LlmApiCallDebugEvent;
		assertDebugEventCoreInterfaceIsValid(expectedPlanningPromptLLmApiCall);
		assert.deepStrictEqual(debugLog[2], {
			id: expectedPlanningPromptLLmApiCall.id,
			traceId: expectedTraceId,
			timestamp: expectedPlanningPromptLLmApiCall.timestamp,
			triggeringEventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
			eventFlowTraceId: expectedPlanningPromptEventFlowTraceId,
			eventName: "LLM_API_CALL",
			modelName: "gpt-4o",
			requestParams: expectedPlanningPromptLLmApiCall.requestParams,
			response: expectedPlanningPromptLLmApiCall.response,
			tokenUsage: expectedPlanningPromptLLmApiCall.tokenUsage,
		} satisfies LlmApiCallDebugEvent);
		assert(expectedPlanningPromptLLmApiCall.requestParams !== undefined);
		assert(expectedPlanningPromptLLmApiCall.response !== undefined);
		assert(expectedPlanningPromptLLmApiCall.tokenUsage?.completionTokens !== undefined);
		assert(expectedPlanningPromptLLmApiCall.tokenUsage.promptTokens !== undefined);

		const expectedPlanningPromptCompleted: PlanningPromptCompleted =
			debugLog[3] as PlanningPromptCompleted;
		assertDebugEventCoreInterfaceIsValid(expectedPlanningPromptCompleted);
		assert.deepStrictEqual(expectedPlanningPromptCompleted, {
			id: expectedPlanningPromptCompleted.id,
			traceId: expectedTraceId,
			timestamp: expectedPlanningPromptCompleted.timestamp,
			eventName: "GENERATE_PLANNING_PROMPT_COMPLETED",
			eventFlowName: EventFlowDebugNames.GENERATE_PLANNING_PROMPT,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: expectedPlanningPromptEventFlowTraceId,
			isLlmResponseValid: true,
			llmGeneratedPlan: expectedPlanningPromptCompleted?.llmGeneratedPlan,
		} satisfies PlanningPromptCompleted);
		assert.strictEqual(expectedPlanningPromptCompleted.llmGeneratedPlan !== undefined, true);
	});

	it("Has generate tree edit event flows and in the expected order with matching eventFlowTraceId", () => {
		const expectedTraceId = (debugLog[0] as DebugEvent).traceId; // All debug events from the same execution should have the same trace id
		assert(expectedTraceId !== undefined);

		// The following two indexes give us the slice of the debug log that should contain the generate tree edit event flows.
		const finalReviewIndex = debugLog.findIndex(
			(event) => event.eventName === "FINAL_REVIEW_STARTED",
		);
		assert.strictEqual(finalReviewIndex > -1, true);
		const completedPlanningPromptIndex = debugLog.findIndex(
			(event) =>
				(event as EventFlowDebugEvent)?.eventFlowName ===
					EventFlowDebugNames.GENERATE_PLANNING_PROMPT &&
				(event as EventFlowDebugEvent)?.eventFlowStatus === "COMPLETED",
		);
		assert.strictEqual(completedPlanningPromptIndex > -1, true);

		// We first generate a list of all the event flow trace ids mapped to a list of their associated events
		const eventFlowTraceIdToEvents: Record<string, DebugEvent[]> = {};
		for (let i = completedPlanningPromptIndex + 1; i < finalReviewIndex; i++) {
			const traceId = (debugLog[i] as unknown as EventFlowDebugEvent).eventFlowTraceId;
			if (eventFlowTraceIdToEvents[traceId] === undefined) {
				eventFlowTraceIdToEvents[traceId] = [debugLog[i] as EventFlowDebugEvent];
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				eventFlowTraceIdToEvents[traceId]!.push(debugLog[i] as EventFlowDebugEvent);
			}
		}

		// Now we confirm that all events mapped with a event flow trace id are in the expected order and contain the expected events.
		for (const eventFlowTraceId of Object.keys(eventFlowTraceIdToEvents)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const events = eventFlowTraceIdToEvents[eventFlowTraceId]!;

			const generateTreeEditStartedEvent: GenerateTreeEditStarted =
				events[0] as GenerateTreeEditStarted;
			const expectedEventFlowTraceId = generateTreeEditStartedEvent.eventFlowTraceId;
			assert.strictEqual(expectedEventFlowTraceId !== undefined, true);

			assert.deepStrictEqual(generateTreeEditStartedEvent, {
				id: generateTreeEditStartedEvent.id,
				traceId: expectedTraceId,
				timestamp: generateTreeEditStartedEvent.timestamp,
				eventName: "GENERATE_TREE_EDIT_STARTED",
				eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
				eventFlowStatus: "STARTED",
				eventFlowTraceId: expectedEventFlowTraceId,
				llmPrompt: generateTreeEditStartedEvent.llmPrompt,
			} satisfies GenerateTreeEditStarted);

			const llmApiCallEvent: LlmApiCallDebugEvent = events[1] as LlmApiCallDebugEvent;
			assert.deepStrictEqual(llmApiCallEvent, {
				id: llmApiCallEvent.id,
				traceId: expectedTraceId,
				timestamp: llmApiCallEvent.timestamp,
				eventName: "LLM_API_CALL",
				triggeringEventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
				eventFlowTraceId: expectedEventFlowTraceId,
				modelName: "gpt-4o",
				requestParams: llmApiCallEvent.requestParams,
				response: llmApiCallEvent.response,
				tokenUsage: llmApiCallEvent.tokenUsage,
			} satisfies LlmApiCallDebugEvent);

			const generateTreeEditCompletedEvent = events[2] as GenerateTreeEditCompleted;

			assert.deepStrictEqual(generateTreeEditCompletedEvent, {
				id: generateTreeEditCompletedEvent.id,
				traceId: expectedTraceId,
				timestamp: generateTreeEditCompletedEvent.timestamp,
				eventName: "GENERATE_TREE_EDIT_COMPLETED",
				eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
				eventFlowStatus: "COMPLETED",
				eventFlowTraceId: expectedEventFlowTraceId,
				isLlmResponseValid: true,
				llmGeneratedEdit: generateTreeEditCompletedEvent.llmGeneratedEdit,
			} satisfies GenerateTreeEditCompleted);

			// If the LLM generates null as its edit, this means it thinks no more edits are necessary.
			if (generateTreeEditCompletedEvent.llmGeneratedEdit === null) {
				continue;
			}

			const applyEditEvent = events[3] as unknown as ApplyEditSuccess | ApplyEditFailure;

			const applyEditEventName = applyEditEvent.eventName;
			assert.strictEqual(
				applyEditEventName === "APPLIED_EDIT_SUCCESS" ||
					applyEditEventName === "APPLIED_EDIT_FAILURE",
				true,
			);

			if (applyEditEventName === "APPLIED_EDIT_SUCCESS") {
				assert.deepStrictEqual(applyEditEvent, {
					id: applyEditEvent.id,
					traceId: expectedTraceId,
					timestamp: applyEditEvent.timestamp,
					eventName: "APPLIED_EDIT_SUCCESS",
					eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowStatus: "IN_PROGRESS",
					eventFlowTraceId: expectedEventFlowTraceId,
					edit: applyEditEvent.edit,
				} satisfies ApplyEditSuccess);
			} else {
				assert.deepStrictEqual(applyEditEvent, {
					id: applyEditEvent.id,
					traceId: expectedTraceId,
					timestamp: applyEditEvent.timestamp,
					eventName: "APPLIED_EDIT_FAILURE",
					eventFlowName: EventFlowDebugNames.GENERATE_AND_APPLY_TREE_EDIT,
					eventFlowStatus: "IN_PROGRESS",
					eventFlowTraceId: expectedEventFlowTraceId,
					edit: applyEditEvent.edit,
					errorMessage: applyEditEvent.errorMessage,
					sequentialErrorCount: applyEditEvent.sequentialErrorCount,
				} satisfies ApplyEditFailure);
				assert(applyEditEvent.errorMessage !== undefined);
				assert(applyEditEvent.sequentialErrorCount !== undefined);
			}
		}
	});

	it("Has final review event flows and in the expected order with matching eventFlowTraceId", () => {
		const expectedTraceId = (debugLog[0] as DebugEvent).traceId; // All debug events from the same execution should have the same trace id
		assert(expectedTraceId !== undefined);

		// The following index give us the slice of the debug log that should contain the final review edits.
		const finalReviewIndex = debugLog.findIndex(
			(event) => event.eventName === "FINAL_REVIEW_STARTED",
		);
		const expectedFinalReviewStarted = debugLog[finalReviewIndex] as FinalReviewStarted;
		assertDebugEventCoreInterfaceIsValid(expectedFinalReviewStarted);
		assert.deepStrictEqual(expectedFinalReviewStarted, {
			id: expectedFinalReviewStarted.id,
			traceId: expectedTraceId,
			timestamp: expectedFinalReviewStarted.timestamp,
			eventName: "FINAL_REVIEW_STARTED",
			eventFlowName: EventFlowDebugNames.FINAL_REVIEW,
			eventFlowStatus: "STARTED",
			eventFlowTraceId: expectedFinalReviewStarted.eventFlowTraceId,
			llmPrompt: expectedFinalReviewStarted.llmPrompt,
		} satisfies FinalReviewStarted);
		const expectedFinalReviewEventFlowTraceId = expectedFinalReviewStarted?.eventFlowTraceId;
		assert.strictEqual(expectedFinalReviewEventFlowTraceId !== undefined, true);

		const expectedFinalReviewLLmApiCall: LlmApiCallDebugEvent = debugLog[
			finalReviewIndex + 1
		] as LlmApiCallDebugEvent;
		assert.deepStrictEqual(expectedFinalReviewLLmApiCall, {
			id: expectedFinalReviewLLmApiCall.id,
			traceId: expectedTraceId,
			timestamp: expectedFinalReviewLLmApiCall.timestamp,
			eventName: "LLM_API_CALL",
			triggeringEventFlowName: EventFlowDebugNames.FINAL_REVIEW,
			eventFlowTraceId: expectedFinalReviewEventFlowTraceId,
			modelName: "gpt-4o",
			requestParams: expectedFinalReviewLLmApiCall.requestParams,
			response: expectedFinalReviewLLmApiCall.response,
			tokenUsage: expectedFinalReviewLLmApiCall.tokenUsage,
		} satisfies LlmApiCallDebugEvent);
		assert(expectedFinalReviewLLmApiCall.requestParams !== undefined);
		assert(expectedFinalReviewLLmApiCall.response !== undefined);
		assert(expectedFinalReviewLLmApiCall.tokenUsage?.completionTokens !== undefined);
		assert(expectedFinalReviewLLmApiCall.tokenUsage.promptTokens !== undefined);

		const expectedFinalReviewCompleted = debugLog[
			finalReviewIndex + 2
		] as FinalReviewCompleted;
		assert.deepStrictEqual(expectedFinalReviewCompleted, {
			id: expectedFinalReviewCompleted.id,
			traceId: expectedTraceId,
			timestamp: expectedFinalReviewCompleted.timestamp,
			eventName: "FINAL_REVIEW_COMPLETED",
			eventFlowName: EventFlowDebugNames.FINAL_REVIEW,
			eventFlowStatus: "COMPLETED",
			eventFlowTraceId: expectedFinalReviewEventFlowTraceId,
			isLlmResponseValid: true,
			didLlmAccomplishGoal: expectedFinalReviewCompleted.didLlmAccomplishGoal,
		} satisfies FinalReviewCompleted);
		assert(expectedFinalReviewCompleted.didLlmAccomplishGoal !== undefined);
	});

	it("Has a single matching trace id for all debug events from the same ai-collab execution", () => {
		let expectedTraceId: string | undefined;
		for (const debugEvent of debugLog) {
			if (expectedTraceId === undefined) {
				expectedTraceId = debugEvent.traceId;
			} else {
				assert.strictEqual(debugEvent.traceId, expectedTraceId);
			}
		}
	});
});
