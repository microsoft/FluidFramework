/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { QuizWrapper } from "./quiz/shared/choiceQuizViewModel";
import { html } from "./quiz/shared/view";
import "./quiz/styles/quiz.css";

class PollRunner extends EventEmitter implements IPlatform {

    private started = new Deferred<void>();
    private pollQuiz: QuizWrapper;

    public async run(runtime: IRuntime, platform: IPlatform) {
        this.start(runtime, platform).then(
            () => {
                this.started.resolve();
            },
            (error) => {
                console.error(error);
                this.started.reject(error);
            });

        return this;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        // Wait for start to complete before resolving interfaces
        await this.started.promise;

        switch (id) {
            case "poll":
                return this;
            default:
                return null;
        }
    }

    public setQuestion(text: string) {
        this.pollQuiz.setQuestion(text);
    }

    public addChoice(text: string) {
        this.pollQuiz.addChoice(text);
    }

    private async start(runtime: IRuntime, platform: IPlatform): Promise<void> {
        const collabDoc = await Document.load(runtime);
        const rootMap = collabDoc.getRoot();
        const rootView = await rootMap.getView();

        this.pollQuiz = new QuizWrapper(collabDoc, rootMap, rootView);

        if (!collabDoc.existing) {
            this.pollQuiz.initialize();
        }

        this.pollQuiz.start();

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        content.innerHTML = html;
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new PollRunner());
    return chaincode;
}
