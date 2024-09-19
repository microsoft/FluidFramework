// eslint-disable-next-line import/no-extraneous-dependencies
import { AzureOpenAI } from "openai";
// eslint-disable-next-line import/no-internal-modules
import type { ChatCompletionCreateParamsNonStreaming, ResponseFormatJSONSchema } from "openai/resources/index.mjs";
import { getBaseSystemPrompt } from "./promptGeneration.js";
// import type { ImplicitFieldSchema, TreeView } from "../simple-tree/index.js";

export async function getResponse(userPrompt: string, schema: ResponseFormatJSONSchema): Promise<string> {
	/* TODOs: 
	1. Update the signature to take a TreeView<ImplicitFieldSchema>.
	2. Update body to call getSystemPrompt, cleanup imports/exports.
	3. Finish System prompt construction logic.
	*/
	console.log("Creating Azure OpenAI prompter");

	const apiKey = process.env.AZURE_OPENAI_API_KEY;
	if (apiKey === null || apiKey === undefined) {
		throw new Error("AZURE_OPENAI_API_KEY environment variable not set");
	}

	const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
	if (endpoint === null || endpoint === undefined) {
		throw new Error("AZURE_OPENAI_ENDPOINT environment variable not set");
	}

	const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
	if (deployment === null || deployment === undefined) {
		throw new Error("AZURE_OPENAI_DEPLOYMENT environment variable not set");
	}

	const openai = new AzureOpenAI({
		endpoint,
		deployment,
		apiKey,
		apiVersion: "2024-08-01-preview",
	});

	const body: ChatCompletionCreateParamsNonStreaming = {
		messages: [
			{ role: "system", content: getBaseSystemPrompt() },
			{ role: "user", content: userPrompt },
		],
		model: "gpt-4o",
		response_format: schema,
	};

	try {
		const result = await openai.chat.completions.create(body);
		if (!result.created) {
			throw new Error("LLM did not return result");
		}
		const response = result.choices[0]?.message.content;
		if (response !== null && response !== undefined) {
			return response;
		}
		throw new Error("LLM returned null or undefined response");
	} catch (e) {
		throw new Error((e as Error).message ?? "LLM call failed with an unknown exception");
	}
}