import { JsonModificationAction } from "../../src/actions/jsonModificationAction";
import { OpenAI } from "../../src/openAi";

describe("Suggest LLM Action", () => {
	// this is an integration test, remove the .skip() to see it work
	test("Suggest Text without context via OpenAI chatGPT", async () => {
		const sourceText =
			"Today I pondered on the line between conciousness and software in regards to LLM's. If an LLM provides a substite for dynamic, human like thinking, could it be stitched together with to reproduce something so strikingly similar to concept of conciousness that we cant tell the difference? You know what they say, If it walks like a duck and quacks like a duck...";

		const openAi = new OpenAI();

		type AppState = {
			textArea: string;
			checkbox1: "checked" | "unchecked";
			checkbox2: "checked" | "unchecked";
		};

		const appStateJsonSchema = {
			description: "The json schema representing an application's state",
			type: "object",
			properties: {
				textArea: {
					type: "string",
					description: "A collaborative text area",
				},
				checkbox1: {
					type: "string",
					description: "A checkbox that can be checked or unchecked",
					enum: ["checked", "unchecked"],
				},
				checkbox2: {
					type: "string",
					description: "A checkbox that can be checked or unchecked",
					enum: ["checked", "unchecked"],
				},
			},
		};

		const appState: AppState = {
			textArea: "Hello my friend!",
			checkbox1: "unchecked",
			checkbox2: "unchecked",
		};

		const response = await JsonModificationAction.execute<AppState>(
			openAi,
			appStateJsonSchema,
			appState,
			"Please translate the text area to spanish and check the boxes",
		);
		console.log(response);
	});
});
