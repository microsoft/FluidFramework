import * as ko from "knockout";
import { Choice, Hint, IQuiz } from "./choice";

//
// THe module is named Quizzes mostly to avoid conflicting with this class name here
//
export class Quiz {
    // The quiz question
    public question: KnockoutObservable<string>;

    // The quiz choices
    public choices: KnockoutObservableArray<Choice>;

    // hasAnswer
    public hasAnswer: KnockoutObservable<boolean>;

    // The quiz answer(s) depending on whether multiple answers are allowed
    // Is either an observable or an observable array
    public answer: KnockoutObservableArray<any>;

    // Whether it is required to take the quiz or not
    public required: KnockoutObservable<boolean>;

    // Hints to provide with the quiz
    public hints: KnockoutObservableArray<Hint>;

    // Whether or not to limit attempts
    public limitAttempts: KnockoutObservable<boolean>;

    // The maximum number of quiz attempts
    public maxAttempts: KnockoutObservable<number>;

    // Whether or not to allow retries
    public allowRetries: KnockoutObservable<boolean>;

    // Whether or not to shuffle the quiz choices
    public shuffleChoices: KnockoutObservable<boolean>;

    // Whether there is a time limit on the quiz
    public isTimed: KnockoutObservable<boolean>;

    // The time limit of the quiz in seconds
    public timeLimit: KnockoutObservable<number>;

    // Whether or not to allow multiple correct answers
    public allowMultipleAnswers: KnockoutObservable<boolean>;

    // This takes "single" or "multiple"
    public multipleAnswerOption: KnockoutComputed<string>;

    // Whether or not to allow editing of the choices
    public allowChoiceEditing: KnockoutObservable<boolean>;

    // The set of properties attached to the quiz
    public serializedQuiz: KnockoutComputed<IQuiz>;

    // The font size
    public fontSize: KnockoutObservable<string>;

    /* IQuiz can have array/non-array type answers, but Quiz always has array type answers */
    constructor(quiz: IQuiz) {
        this.question = ko.observable(quiz.question);

        // Stored font information
        this.fontSize = ko.observable(quiz.fontSize ? quiz.fontSize : "medium");

        // Iterate over the choices
        this.choices = ko.observableArray([]);
        quiz.choices.forEach((choice) => {
            this.choices.push(new Choice(choice));
        });

        this.hasAnswer = ko.observable(quiz.hasAnswer == null ? true : quiz.hasAnswer);
        this.answer = ko.observableArray(quiz.answer instanceof Array ? quiz.answer : [quiz.answer]);

        this.required = ko.observable(quiz.required);

        // Iterate over the hints
        this.hints = ko.observableArray([]);
        quiz.hints.forEach((hint) => {
            this.hints.push(new Hint(hint));
        });

        this.limitAttempts = ko.observable(quiz.limitAttempts);
        this.maxAttempts = ko.observable(quiz.maxAttempts).extend({minNumber: 1});
        this.allowRetries = (quiz.allowRetries === undefined) ? ko.observable(true) : ko.observable(quiz.allowRetries);
        this.shuffleChoices = ko.observable(quiz.shuffleChoices);
        this.isTimed = ko.observable(quiz.isTimed);
        this.timeLimit = ko.observable(quiz.timeLimit);
        this.allowChoiceEditing = ko.observable(quiz.allowChoiceEditing);
        this.allowMultipleAnswers = ko.observable(quiz.allowMultipleAnswers);
        this.multipleAnswerOption = ko.computed({
            read: () => this.allowMultipleAnswers() ? "multiple" : "single",
            write: (val: any) => this.allowMultipleAnswers(val === "multiple" ? true : false),
        });

        this.serializedQuiz = ko.computed(() => {
            let answer;
            // convert answer type into non-array if necessary
            if (this.hasAnswer) {
                answer = this.allowMultipleAnswers() ? this.answer() : this.answer()[0];
            } else {
                answer = null;
            }

            return {
                allowChoiceEditing: this.allowChoiceEditing(),
                allowMultipleAnswers: this.allowMultipleAnswers(),
                allowRetries: this.allowRetries(),
                answer: ko.toJS(answer),
                choices: ko.toJS(this.choices()),
                fontSize: this.fontSize(),
                hasAnswer: this.hasAnswer(),
                hints: ko.toJS(this.hints()),
                isTimed: this.isTimed(),
                limitAttempts: this.limitAttempts(),
                maxAttempts: this.maxAttempts(),
                question: this.question(),
                required: this.required(),
                shuffleChoices: this.shuffleChoices(),
                timeLimit: this.timeLimit(),
            };
        });
    }
}
