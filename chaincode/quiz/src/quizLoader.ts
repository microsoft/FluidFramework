import { Document } from "./document";
import { initialize } from "./quiz/shared/choiceQuizViewModel";

export function initMcqView(collabDoc: Document) {
    initialize(true, collabDoc, undefined);
}
