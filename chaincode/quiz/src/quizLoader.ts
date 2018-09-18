import { Document } from "./document";
import { initialize } from "./quiz/shared/choiceQuizViewModel";

export function initPollView(collabDoc: Document) {
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
