import {
	TextSummarizeAction,
	TextSummarizeActionResponse,
} from "../../src/actions/textSummarizeAction";
import { OpenAI } from "../../src/openAi";

describe("Summarize LLM Action", () => {
	// this is an integration test, remove the .skip() to see it work
	test("Summarize Text without context via OpenAI chatGPT", async () => {
		const sourceText =
			"Today I pondered on the line between conciousness and software in regards to LLM's. If an LLM provides a substite for dynamic, human like thinking, could it be stitched together with to reproduce something so strikingly similar to concept of conciousness that we cant tell the difference? You know what they say, If it walks like a duck and quacks like a duck...";

		const openAi = new OpenAI();

		const response: TextSummarizeActionResponse = await TextSummarizeAction.execute(
			openAi,
			sourceText,
		);
		console.log(response);
	});
});
