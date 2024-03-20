import { FluidAgent } from "../../src/fluidAgent";
import { OpenAI } from "../../src/openAi";

jest.setTimeout(10000);

describe("Fluid Agent", () => {
	test("test1", async () => {
		const openAi = new OpenAI();

		const fluidAgent = new FluidAgent(openAi);

		const response = await fluidAgent.userChat(
			"Hey how are you today? Can you summarize my app?",
		);

		console.log(response.data.choices[0]);
	});
});
