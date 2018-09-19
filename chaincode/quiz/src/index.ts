import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { html } from "./quiz/shared/view";
import "./quiz/styles/quiz.css";
import { initPollEdit, initPollView } from "./quizLoader";
import { loadScript } from "./scriptLoader";

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        const hostContent: HTMLElement = platform ? platform.queryInterface<HTMLElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        this.initPoll(collabDoc, content);
    }

    private async initPoll(collabDoc: Document, content: HTMLDivElement) {

        // Load scripts and setup knockout binding code.
        if (collabDoc.existing) {
            initPollView(collabDoc);
        } else {
            await this.loadScripts();
            initPollEdit(collabDoc);
        }

        // Add in the setup UI
        content.innerHTML = html;
    }

    private async loadScripts() {
        const scriptPromises = [];

        // tslint:disable max-line-length
        // scriptPromises.push(loadScript("mathjax", "//e0d1.wpc.azureedge.net/80E0D1/OfficeMixProdBlobStorage/mathjax/MathJax.js?config=TeX-AMS-MML_HTMLorMML"));
        scriptPromises.push(loadScript("ckeditor", "//e0d1.wpc.azureedge.net/80E0D1/OfficeMixProdBlobStorage/ckeditor/ckeditor.js"));
        // scriptPromises.push(loadScript("mathquill", "//e0d1.wpc.azureedge.net/80E0D1/OfficeMixProdBlobStorage/mathquill/mathquill.js"));

        await Promise.all(scriptPromises);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
