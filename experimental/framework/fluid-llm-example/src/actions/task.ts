"use server";

import { createJsonTranslator, createOpenAILanguageModel, type Result } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import type { Task, TaskGroup } from "@/types/task";
import type { SharedTreeTaskGroup } from "@/types/sharedTreeAppSchema";

// Todo: Make use of system prompts with the open ai model, this may yield better results.
// I am unsure if this is possible using typechat as a controller of the underlying open AI API's

export async function editTask(workItem: Task, specificAsk: string): Promise<Result<Task>> {
	const OPEN_AI_KEY = process.env.OPEN_AI_KEY;
	if (OPEN_AI_KEY === undefined) {
		throw new Error("OPEN_AI_KEY environment variable is not set");
	}
	const model = createOpenAILanguageModel(OPEN_AI_KEY, "gpt-4o");
	const typesFile = fs.readFileSync(
		path.join(__dirname, "../../../../src/types/task.ts"),
		"utf8",
	);
	const validator = createTypeScriptJsonValidator<Task>(typesFile, "Task");
	const translator = createJsonTranslator(model, validator);

	const prompt = `You are a manager that is helping out with a project management tool. You have been asked to edit a task. \n\n
	The task is as follows:
	\n\n \`\`\`
	${JSON.stringify(workItem)}
	\n\n \`\`\`

	This is the specific ask you have been given: "${specificAsk}"
	`;

	console.log("sending prompt: ", prompt);
	const response = await translator.translate(prompt);
	console.log("response: ", response);
	return response;
}

export async function editTaskGroup(
	taskGroup: TaskGroup,
	specificAsk: string,
): Promise<Result<TaskGroup>> {
	const OPEN_AI_KEY = process.env.OPEN_AI_KEY;
	if (OPEN_AI_KEY === undefined) {
		throw new Error("OPEN_AI_KEY environment variable is not set");
	}

	const model = createOpenAILanguageModel(OPEN_AI_KEY, "gpt-4o");
	const typesFile = fs.readFileSync(
		path.join(__dirname, "../../../../src/types/task.ts"),
		"utf8",
	);
	const validator = createTypeScriptJsonValidator<TaskGroup>(typesFile, "TaskGroup");
	const translator = createJsonTranslator(model, validator);

	const { taskGroupCopy, newToOldTaskGroupId, newToOldTaskIds, newToOldEngineerIds } =
		replaceTaskGroupIdsWithSimpleId(taskGroup);
	console.log("newToOldTaskGroupId: ", newToOldTaskGroupId);
	console.log("newToOldTaskIds: ", newToOldTaskIds);
	console.log("taskGroupCopy: ", newToOldEngineerIds);
	console.log("taskGroupCopy: ", taskGroupCopy);

	const prompt = `You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks. \n\n
	The task group is as follows:
	\n\n \`\`\`
	${JSON.stringify(taskGroupCopy)}
	\n\n \`\`\`

	This is the specific ask you have been given: "${specificAsk}"

	Keep in mind that adding a task with a new id is considered a new task. id's must be unique and are a montonically increasing integer represented as a string.
	`;

	console.log("sending prompt: ", prompt);
	const response = await translator.translate(prompt);
	console.log("response: ", response);

	if (response.success) {
		console.log(
			"response tasks before id replacement:",
			response.data.tasks.map((task) => {
				return { ...task };
			}),
		);

		// Replaces short id's with the original hash based id's.
		const modifiedTaskGroup = response.data;
		modifiedTaskGroup.id = newToOldTaskGroupId[modifiedTaskGroup.id];
		modifiedTaskGroup.tasks.forEach((task) => {
			if (newToOldTaskIds[task.id] !== undefined) {
				task.id = newToOldTaskIds[task.id];
			} else {
				// If the LLM created a task with a new id using our prompt of a monotnically increasing integer
				// then we need to replace it with an actual hash so we don't have duplicate id's
				task.id = uuidv4();
			}
		});
		modifiedTaskGroup.engineers.forEach((engineer) => {
			if (newToOldEngineerIds[engineer.id] !== undefined) {
				engineer.id = newToOldEngineerIds[engineer.id];
			} else {
				// see above comment on replacing task id's with a hash.
				engineer.id = uuidv4();
			}
		});

		console.log("response data:", {
			...modifiedTaskGroup,
			tasks: modifiedTaskGroup.tasks.map((task) => {
				return { ...task };
			}),
			engineers: modifiedTaskGroup.engineers.map((engineer) => {
				return { ...engineer };
			}),
		});
	}
	return response;
}

function replaceTaskGroupIdsWithSimpleId(taskGroup: TaskGroup) {
	const taskGroupCopy = { ...taskGroup };

	// Replace task group id
	const newToOldTaskGroupId: Record<string, string> = { "1": taskGroup.id };
	taskGroupCopy.id = "1";

	// Replace task id's
	const newToOldTaskIds: Record<string, string> = {};
	for (let i = 0; i < taskGroup.tasks.length; i++) {
		const originalTaskId = `${taskGroup.tasks[i].id}`;
		const newTaskId = `${i}`;
		taskGroupCopy.tasks[i].id = newTaskId;
		newToOldTaskIds[newTaskId] = originalTaskId;
	}

	// Replace engineer id's
	const newToOldEngineerIds: Record<string, string> = {};
	for (let i = 0; i < taskGroup.engineers.length; i++) {
		const originalId = `${taskGroup.engineers[i].id}`;
		const newId = `${i}`;
		taskGroupCopy.engineers[i].id = newId;
		newToOldEngineerIds[newId] = originalId;
	}

	return { taskGroupCopy, newToOldTaskGroupId, newToOldTaskIds, newToOldEngineerIds };
}
