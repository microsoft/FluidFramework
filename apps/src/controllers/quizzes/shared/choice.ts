// Saved state for a choice quiz
export interface IChoiceQuizState {
    seed: string;
    submission: any;
    feedbackChoices: number[];
}

// Interface to represent a choice in a quiz
export interface IChoice {
    // Unique ID used to represent the choice
    id: number;

    // The text of the choice
    choice: string;

    // Feedback to provide when the response is chosen
    feedback: string;
}

// Interface for a hint provided with a quiz
export interface IHint {
    text: string;
}

export interface IQuiz {
    // The quiz question
    question: string;

    // Font size to apply to quiz
    fontSize: string;

    // The quiz choices
    choices: IChoice[];

    // hasAnswer
    hasAnswer: boolean;

    // The quiz answer(s) depending on whether multiple answers are allowed
    answer: any;

    // Whether it is required to take the quiz or not
    required: boolean;

    // Hints to provide with the quiz
    hints: IHint[];

    // Whether or not to limit the quiz attempts
    limitAttempts: boolean;

    // The maximum number of quiz attempts
    maxAttempts: number;

    // Whether or not to allow retries
    allowRetries: boolean;

    // Whether or not to shuffle the quiz choices
    shuffleChoices: boolean;

    // If the quiz is timed or not
    isTimed: boolean;

    // The time limit of the quiz in seconds
    timeLimit: number;

    // Whether or not to allow multiple correct answers
    allowMultipleAnswers: boolean;

    // Whether or not to allow editing of the choices
    allowChoiceEditing: boolean;
}

// Class to hold bindable hint information
export class Hint {
    public text: KnockoutObservable<string>;

    constructor(hint: IHint) {
        this.text = ko.observable(hint.text);
    }
}

export class Choice {
    // Unique ID used to represent the choice
    public id: KnockoutObservable<number>;

    // The text of the choice
    public choice: KnockoutObservable<string>;

    // Feedback to provide when the response is chosen
    public feedback: KnockoutObservable<string>;

    constructor(choice: IChoice) {
        this.id = ko.observable(choice.id);
        this.choice = ko.observable(choice.choice);
        this.feedback = ko.observable(choice.feedback);
    }

    // Removes feedback from the choice
    public removeFeedback() {
        this.feedback(null);
    }

    // Adds feedback to the choice
    public addFeedback() {
        this.feedback("");
    }
}
