import { api } from "@prague/routerlicious";
import { initialize } from "./shared/choiceQuizViewModel";

import prague = api;

async function loadDocument(id: string, token?: string): Promise<prague.api.Document> {
    console.log("Loading in quiz document...");
    const document = await prague.api.load(id, { encrypted: false, token }).catch((err) => {
        return Promise.reject(err);
    });
    console.log("Document loaded");
    return document;
}

export async function load(
    id: string,
    type: string,
    tenantId: string,
    endPoints: any,
    token?: string, workerConfig?: any) {
        prague.socketStorage.registerAsDefault(endPoints.delta, endPoints.storage, tenantId);
        if (type === "mcq/edit") {
            loadDocument(id, token).then(async (doc) => {
                if (doc.existing) {
                    console.log(`Quiz with same name created previously!`);
                } else {
                    const rootMap = doc.getRoot();
                    const rootView = await rootMap.getView();
                    initMcqEdit(rootView);
                }
            }, (err) => {
                console.log(err);
            });
        } else if (type === "mcq/view") {
            loadDocument(id, token).then(async (doc) => {
                if (!doc.existing) {
                    console.log(`Quiz is not created yet!`);
                } else {
                    const rootMap = doc.getRoot();
                    await rootMap.wait("quiz");
                    const rootView = await rootMap.getView();
                    initMcqView(rootView);
                }
            }, (err) => {
                console.log(err);
            });
        }
}

function initMcqEdit(view: api.types.IMapView) {
    initialize(
        false,
        view,
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

function initMcqView(view: api.types.IMapView) {
    initialize(true, view, undefined);
}
