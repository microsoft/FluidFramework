/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Document } from "./document";
import { initialize } from "./quiz/shared/choiceQuizViewModel";

export function InitTakingQuiz(collabDoc: Document) {
    initialize(true, collabDoc, undefined);
}

export function initPollEdit(collabDoc: Document) {
    initialize(
        false,
        collabDoc,
        {
            allowChoiceEditing: true,
            allowMultipleAnswers: false,
            answer: null,
            choices: [
                { id: 0, choice: "<p>Insert option here</p>", feedback: null },
                { id: 1, choice: "<p>Insert option here</p>", feedback: null },
            ],
            fontSize: "medium",
            hasAnswer: false,
            hints: [],
            isTimed: false,
            limitAttempts: false,
            maxAttempts: 2,
            question: "<p>Insert question here</p>",
            required: false,
            shuffleChoices: false,
            timeLimit: 120,
        });
}

export function initMCQEdit(collabDoc: Document) {
    initialize(
        false,
        collabDoc,
        {
            allowChoiceEditing: true,
            allowMultipleAnswers: false,
            allowRetries: true,
            answer: "0",
            choices: [
                { id: 0, choice: "<p>Insert option here</p>", feedback: null },
                { id: 1, choice: "<p>Insert option here</p>", feedback: null },
            ],
            fontSize: "medium",
            hasAnswer: true,
            hints: [],
            isTimed: false,
            limitAttempts: false,
            maxAttempts: 2,
            question: "<p>Insert question here</p>",
            required: false,
            shuffleChoices: false,
            timeLimit: 120,
        });
}

export function initTFEdit(collabDoc: Document) {
    initialize(
        false,
        collabDoc,
        {
            allowChoiceEditing: false,
            allowMultipleAnswers: false,
            allowRetries: true,
            answer: "0",
            choices: [
                { id: 0, choice: "True", feedback: null },
                { id: 1, choice: "False", feedback: null },
            ],
            fontSize: "medium",
            hasAnswer: true,
            hints: [],
            isTimed: false,
            limitAttempts: true,
            maxAttempts: 1,
            question: "<p>Insert question here</p>",
            required: false,
            shuffleChoices: false,
            timeLimit: 120,
        });
}
