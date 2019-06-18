/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { html } from "./quiz/shared/view";
import "./quiz/styles/quiz.css";
import { initMCQEdit, initPollEdit, InitTakingQuiz, initTFEdit } from "./quizLoader";
import { loadScript } from "./scriptLoader";

class QuizPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class Runner {
    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        this.start(runtime, platform).catch((error) => console.error(error));
        return new QuizPlatform();
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        const collabDoc = await Document.load(runtime);

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
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
            InitTakingQuiz(collabDoc);
        } else {
            await this.loadScripts();
            if (collabDoc.id.startsWith("mcq")) {
                initMCQEdit(collabDoc);
            } else if (collabDoc.id.startsWith("tf")) {
                initTFEdit(collabDoc);
            } else {
                initPollEdit(collabDoc);
            }
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
