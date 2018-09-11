import { initialize } from "./shared/editQuiz";

export async function load(id: string, tenantId: string, endPoints: any, token?: string, workerConfig?: any) {
    console.log(`Loaded`);
    Labs.DefaultHostBuilder = () => {
        return new Labs.PostMessageLabHost("test", parent, "*");
    };
    initialize({
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
