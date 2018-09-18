import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { html } from "./quiz/shared/view";
import "./quiz/styles/quiz.css";
import { initMcqView } from "./quizLoader";

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        const hostContent: HTMLElement = platform ? platform.queryInterface<HTMLElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        this.initQuiz(collabDoc, content);
    }

    private async initQuiz(collabDoc: Document, content: HTMLDivElement) {
        initMcqView(collabDoc);

        // Add in the setup UI
        content.innerHTML = html;
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
