"use server";

import { createJsonTranslator, createOpenAILanguageModel, type Result } from "typechat";
import { createTypeScriptJsonValidator } from "typechat/ts";
import fs from "fs";
import path from "path";

import type { Task, TaskGroup } from "@/types/task";
import type { SharedTreeTaskGroup } from "@/types/sharedTreeAppSchema";

// Todo: Make use of system prompts with the open ai model, this may yield better results.
// I am unsure if this is possible using typechat as a controller of the underlying open AI API's

const OPEN_AI_KEY = process.env.OPEN_AI_KEY;

export async function editTask(workItem: Task, specificAsk: string): Promise<Result<Task>> {
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

	const prompt = `You are a manager that is helping out with a project management tool. You have been asked to edit a group of tasks. \n\n
	The task group is as follows:
	\n\n \`\`\`
	${JSON.stringify({
		...taskGroup,
		tasks: taskGroup.tasks.map((task) => {
			return { ...task };
		}),
		engineers: taskGroup.engineers.map((engineer) => {
			return { ...engineer };
		}),
	})}
	\n\n \`\`\`

	This is the specific ask you have been given: "${specificAsk}"
	`;

	console.log("sending prompt: ", prompt);
	const response = await translator.translate(prompt);
	console.log("response: ", response);
	if (response.success) {
		console.log(
			"response tasks: ",
			response.data.tasks.map((task) => {
				return { ...task };
			}),
		);
	}
	return response;
}
