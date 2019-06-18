/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMap, IMapView, IValueChanged } from "@prague/map";
import * as $ from "jquery";
import * as ko from "knockout";
import { Document } from "../../Document";
import { Choice, Hint, IQuiz } from "./choice";
import { Quiz } from "./choiceQuiz";
import { ControlBarViewModel, ControlButton } from "./controlBar";
import { addCustomBindings } from "./customBindings";
import * as types from "./definitions";
import * as utils from "./utils";

interface IChoiceQuizState {
    seed: string;
    submission: any;
    feedbackChoices: number[];
}

//
// Class used to represent a view template and the view model bound to it. Used to switch between the edit
// and the view bindings.
//
class AppView {
    public template: string;
    public viewModel: any;
    public afterRender: () => {};

    constructor(template: string, viewModel: any) {
        this.template = template;
        this.viewModel = viewModel;

        this.afterRender = this._afterRender.bind(this);
    }

    private _afterRender() {
        if (this.viewModel && this.viewModel.afterRender) {
            this.viewModel.afterRender();
        }
    }
}

//
// A choice within the quiz view and a boolean flat indicating whether or not we should show feedback for the choice
//
class QuizViewChoice {
    public choice: Choice;
    public showFeedback: KnockoutObservable<boolean>;

    constructor(choice: Choice, feedbackChoices: number[]) {
        const choiceId = choice.id();
        this.showFeedback = ko.observable(feedbackChoices.some((value) => choiceId === value));
        this.choice = choice;
    }
}

//
// The show view model represents the current state of the quiz being taken
//
class ShowViewModel {
    public quiz: Quiz;
    public controlBar: ControlBarViewModel;
    public choices: KnockoutComputed<QuizViewChoice[]>;
    public submission: KnockoutObservableArray<any>;
    public hints: KnockoutComputed<Hint[]>;
    public hintState: KnockoutComputed<string>;
    public currentHint: KnockoutObservable<number>;
    public attemptsMade: KnockoutObservable<number>;
    public retriesAllowed: KnockoutObservable<boolean>;
    public attemptsRemaining: KnockoutComputed<number>;
    public timeRemaining: KnockoutObservable<number>;
    public timeRemainingFormatted: KnockoutComputed<string>;
    public intervalId: any;
    public result: KnockoutObservable<string>;
    public resultMessages: KnockoutComputed<string[]>;
    public isFinished: KnockoutComputed<boolean>;
    public feedbackChoices: KnockoutObservableArray<number>;
    public fontSize: KnockoutComputed<string>;
    public submitEnabled: KnockoutComputed<boolean>;
    public selectAnswerMessage: KnockoutComputed<string>;

    private appViewModel: AppViewModel;

    // TODO: Should make a type for attempt
    private attempt: any;

    constructor(
        appViewModel: AppViewModel,
        configuration: types.IConfiguration,
        attempt: any,
        state: any) {
        this.appViewModel = appViewModel;
        this.quiz = new Quiz(((configuration.components[0]) as types.IChoiceComponent).data as IQuiz);
        this.attempt = attempt;

        // View state
        this.fontSize = ko.computed(() => {
            return "quiz-body-text-" + this.quiz.fontSize();
        });

        // Either setup the random number generator seed or get the currently set one
        const quizState = state ? state.data as IChoiceQuizState : undefined;

        // Load the submissions from the state or set defaults
        this.submission = ko.observableArray() as any;
        if (quizState) {
            this.submission(quizState.submission);
        }

        this.submitEnabled = ko.computed(() => {
            const submission = this.submission();
            const allowMultipleAnswers = this.quiz.allowMultipleAnswers();
            return allowMultipleAnswers || submission.length > 0;
        });

        // Store any feedback links we've seen
        const feedbackChoices = quizState ? quizState.feedbackChoices : [];
        this.feedbackChoices = ko.observableArray(feedbackChoices);

        // TODO: We should save lab state here

        // TODO: We should always save all states such as hints used. But not for now.

        // TODO: we should get the submission history from DB.
        const submissions = [];

        // Setup the result field
        this.result = ko.observable("");
        this.result.extend({notify: "always"});

        if (submissions.length > 0) {
            const lastSubmissions = submissions[submissions.length - 1];
            this.submission(lastSubmissions.answer.answer);

            if (this.quiz.hasAnswer()) {
                this.result(lastSubmissions.result.score === 1 ? "correct" : "incorrect");
            } else {
                this.result("submitted");
            }
        }

        // TODO: we should get the hints history from DB.
        const hints = [];
        let hintsUsed = 0;
        for (const hint of hints) {
            if (hint.hasBeenRequested) {
                hintsUsed++;
            }
        }

        // Update the current hint
        this.currentHint = ko.observable(hintsUsed);

        // Create the set of choices for the quiz
        this.choices = ko.computed(() => {
            const choices = this.quiz.choices();
            const showChoices = [];
            choices.forEach((choice) => showChoices.push(new QuizViewChoice(choice, feedbackChoices)));
            return this.quiz.shuffleChoices() ? utils.shuffle(showChoices) : showChoices;
        });

        // The set of hints to display
        this.hints = ko.computed(() => {
            return this.quiz.hints().slice(0, this.currentHint());
        });

        // Text to use to describe the hints
        this.hintState = ko.computed(() => {
            const hintPostfix = this.quiz.hints().length > 0 ?
                " (" + this.currentHint() + " of " + hints.length + ")" : "";
            return "Hint" + hintPostfix;
        });

        // Setup the number of attempts remaining
        const usedAttempts = submissions.length;
        this.attemptsMade = ko.observable(usedAttempts);
        this.attemptsRemaining = ko.computed(() => this.quiz.maxAttempts() - this.attemptsMade());

        // Setup if retry is allowed
        this.retriesAllowed = this.quiz.allowRetries;

        //
        // Setup the time remaining
        //
        this.timeRemaining = ko.observable(0);
        this.timeRemainingFormatted = ko.computed(() => {
            return "No time";
        });

        //
        // Compute a flag indicating when the quiz is over
        //
        this.isFinished = ko.computed(() => {
            const isCorrect = this.result() === "correct";
            const timeout = this.result() === "timeout";
            const isSubmitted = this.result() === "submitted";
            const noMoreAttempts = (this.quiz.limitAttempts() && this.attemptsRemaining() === 0) ||
                (!this.quiz.limitAttempts() && isCorrect);

            return isCorrect || noMoreAttempts || timeout || isSubmitted;
        });

        //
        // Subscribe to finished to change the quiz time limit
        //
        this.isFinished.subscribe((finished) => {
            if (finished && this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        });

        //
        // Convert from the result enum string to a text string
        //
        this.resultMessages = ko.computed(() => {
            switch (this.result()) {
                case "correct":
                    return ["QuizMessageCorrect", "QuizMessageGreatJob"];
                case "incorrect":
                    const incorrectMessage = this.quiz.limitAttempts() && (this.attemptsRemaining() === 0) ?
                        ["QuizMessageIncorrect"] : ["QuizMessageIncorrect", "QuizMessageTryAgain"];
                    return incorrectMessage;
                case "timeout":
                    return ["Time Expired", ""];
                case "submitted":
                    return ["QuizMessageSubmitted", ""];
                default:
                    return ["", ""];
            }
        });

        // Generate Select Answer Message
        this.selectAnswerMessage = ko.computed(() => {
            if (this.quiz.hasAnswer()) {
                return (this.quiz.allowMultipleAnswers()) ? "QuizTextSelectAnswers" : "QuizTextSelectAnswer";
            } else {
                return (this.quiz.allowMultipleAnswers()) ? "QuizTextSelectOptions" : "QuizTextSelectOption";
            }
        });

        this.initControlBar();
    }

    //
    // Called when the user clicks on the submit button.
    //
    public submit() {
        let submission = this.submission();
        const answer = this.quiz.answer();
        const choices = this.choices();

        // Return early if no submission.
        if (submission.length === 0) {
            return;
        }

        // Slice to clone the array so that we don't store the same reference
        submission = submission.slice(0);

        // Check to see if they got it correct
        let correct = false;
        if (this.quiz.hasAnswer()) {
            correct = this.validateSubmission(submission, answer);
            this.result(correct ? "correct" : "incorrect");
        } else {
            this.result("submitted");
        }

        // Flip the feedback bit for any submitted value
        submission.forEach((submittedValue) => {
            choices.forEach((choice) => {
                if (choice.choice.feedback() != null && choice.choice.id().toString() === submittedValue) {
                    if (!choice.showFeedback()) {
                        choice.showFeedback(true);
                        this.feedbackChoices.push(choice.choice.id());
                    }
                }
            });
        });

        // Update the map with submission.
        const responseMap = this.appViewModel.mapView.get("response") as IMap;
        const clientId = this.appViewModel.collabDoc.clientId;
        responseMap.get("numRows").then((rowId: number) => {
            responseMap.set(`${rowId}x0`, clientId);
            const submissionIds = [];
            submission.forEach((submittedValue) => {
                submissionIds.push(submittedValue);
            });
            choices.forEach((choice) => {
                if (submissionIds.indexOf(choice.choice.id().toString()) !== -1) {
                    console.log(`Matched: ${choice.choice.id()} ${choice.choice.choice()}`);
                    responseMap.set(`${rowId}x${choice.choice.id() + 1}`, 1);
                } else {
                    console.log(`Not matched: ${choice.choice.id()} ${choice.choice.choice()}`);
                    responseMap.set(`${rowId}x${choice.choice.id() + 1}`, 0);
                }
            });
            responseMap.set("numRows", rowId + 1);
            console.log(`Submission updated!`);
        });

        // Update the attempts
        this.attemptsMade(this.attemptsMade() + 1);

        // Update the current attempt result
        // TODO: Submit your result here.
    }

    //
    // Called once the quiz is over and we can move on to the next lab
    //
    public done() {
        // TODO: Move to next quiz.
    }

    //
    // Renders another hint
    //
    public giveHint() {
        const currentHint = this.currentHint();
        this.attempt.getValues("hints")[currentHint].getValue((err, data) => {
            if (err) {
                this.appViewModel.showError(err);
            }
        });
        this.currentHint(this.currentHint() + 1);
    }

    public flipFeedback(index: number) {
        const choice = this.choices()[index];
        if (choice.choice.feedback() != null) {
            if (!choice.showFeedback()) {
                choice.showFeedback(true);
                this.feedbackChoices.push(choice.choice.id());
            } else {
                choice.showFeedback(false);
                this.feedbackChoices.remove(choice.choice.id());
            }
        }
    }

    //
    // Allows the user to retry the quiz
    //
    public retry() {
        this.appViewModel.retry();
    }

    public flipSelection(index: number) {
        if (this.isFinished()) {
            return;
        }
        this.setSelection(index, !this.isSelected(index));
    }

    public isSelected(index: number) {
        const choiceIdString: string = this.choices()[index].choice.id().toString();
        return this.submission.indexOf(choiceIdString) !== -1;
    }

    public afterRender() {
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 0);
    }

    //
    // Helper method that checks to see whether the submission matches the answer
    //
    private validateSubmission(submission: any[], answer: any[]): boolean {
        if (submission.length !== answer.length) {
            return false;
        }

        return submission.every((value) => {
            return answer.indexOf(value) !== -1;
        });
    }

    private initControlBar() {
        this.controlBar = new ControlBarViewModel();

        this.controlBar.rightButtons.push(
            new ControlButton(
                "QuizTextHint", () => { this.giveHint(); },
                () => !this.isFinished() && this.quiz.hints().length > this.currentHint()));

        this.controlBar.rightButtons.push(
            new ControlButton(
                "QuizTextSubmit", () => { this.submit(); },
                () => !this.isFinished() && this.submitEnabled(), () => !this.isFinished()));
        if (this.quiz.hasAnswer()) {
            this.controlBar.rightButtons.push(
                new ControlButton(
                    "QuizTextRetry", () => { this.retry(); },
                    () => (this.isFinished() && this.retriesAllowed())));
        }
    }

    private setSelection(index: number, isChecked: boolean) {
        if (this.isFinished()) {
            return;
        }

        const choiceIdString: string = this.choices()[index].choice.id().toString();
        if (isChecked) {
            if (!this.quiz.allowMultipleAnswers()) {
                this.submission.removeAll();
            }
            if (this.submission.indexOf(choiceIdString) === -1) {
                this.submission.push(choiceIdString);
            }
        } else {
            this.submission.remove(choiceIdString);
        }
    }
}

//
// View model for the entire quiz app. Primarily resonsible for switching between the edit and view states.
//
class AppViewModel {
    public view: KnockoutObservable<AppView>;
    public errorMessage: KnockoutObservable<string> = ko.observable("");

    public configuration: any = undefined;
    public currentMode: types.LabMode = undefined;
    public mapView: IMapView;
    public rootMap: IMap;
    public collabDoc: Document;

    public isModeSetByAuthor: KnockoutObservable<boolean>;

    constructor(rootMap: IMap, mapView: IMapView, collabDoc: Document) {

        // The view specifies what is the current view model to make use of
        this.view = ko.observable(new AppView("emptyTemplate", null));

        // Initialize the current mode
        this.isModeSetByAuthor = ko.observable(false);

        this.mapView = mapView;
        this.rootMap = rootMap;
        this.collabDoc = collabDoc;

        const quizConfig = mapView.get("quiz") as string;
        this.configuration = JSON.parse(quizConfig) as types.IConfiguration;
        this.switchToShowMode(false);
        this.listenToUpdate();
    }

    public retry() {
        this.switchToShowMode(true);
    }

    public showError(error: any) {
        this.errorMessage(JSON.stringify(error));
    }

    private switchToShowMode(isModeSetByAuthor: boolean) {
        const attempts = undefined;
        const state = undefined;
        this.view(
            new AppView(
                "showTemplate",
                new ShowViewModel(this, this.configuration, attempts, state)),
            );

        this.isModeSetByAuthor(isModeSetByAuthor);
        this.currentMode = types.LabMode.View;
    }

    private listenToUpdate() {
        this.rootMap.on("valueChanged", async (changed: IValueChanged ) => {
            if (changed.key === "quiz") {
                const quizConfig = this.mapView.get("quiz") as string;
                this.configuration = JSON.parse(quizConfig) as types.IConfiguration;
                this.switchToShowMode(false);
            }
        });
    }
}

//
// Method that given a quiz, returns the configuration sent to the server
//
function getConfiguration(quiz: IQuiz): types.IConfiguration {
    const choices: types.IChoice[] = [];

    // Old quizzes have 'name' and 'value' field. New quiz just sets them as null.
    quiz.choices.forEach((choice) => {
        choices.push(
            {
              content: { "text/html": choice.choice, "text/plain": $(choice.choice).text() },
              id: choice.id.toString(),
              name: null,
              value: null,
            });
    });

    const hints: types.IValue[] = [];
    quiz.hints.forEach((hint) => {
        hints.push({ isHint: true, value: {"text/plain": hint.text } });
    });

    const choiceComponent: types.IChoiceComponent = {
        answer: quiz.allowMultipleAnswers ? quiz.answer : (quiz.answer != null ? [quiz.answer] : []),
        choices,
        data: quiz,
        hasAnswer: quiz.hasAnswer ? true : false,
        maxAttempts: quiz.limitAttempts ? quiz.maxAttempts : 0,
        maxScore: 1,
        name: "Choice Question",
        question: { "text/html": quiz.question, "text/plain": $(quiz.question).text() },
        secure: false,
        timeLimit: quiz.isTimed ? quiz.timeLimit : 0,
        type: "poll",
        values: { hints },
    };

    return {
        analytics: null,
        appVersion: { major: 0, minor: 1 },
        components: [choiceComponent],
        name: "Poll Quiz",
        timeline: null,
    };
}

export class QuizWrapper {

    constructor(private collabDoc: Document, private rootMap: IMap, private mapView: IMapView) {
    }

    public initialize() {
        this.mapView.set("quiz", this.createEmptyQuizConfig());
        const responseMap = this.mapView.get("response") as IMap;
        responseMap.set("0x0", "User");
        responseMap.set("numRows", 1);
        responseMap.set("numCols", 1);
    }

    public start() {
        const appViewModel = new AppViewModel(this.rootMap, this.mapView, this.collabDoc);
        addCustomBindings();
        ko.applyBindings(appViewModel);
    }

    public setQuestion(text: string) {
        const currentConfig = this.mapView.get("quiz") as types.IConfiguration;
        const currentQuiz = ((currentConfig.components[0]) as types.IChoiceComponent).data as IQuiz;
        currentQuiz.question = text;
        this.mapView.set("quiz", this.serializeQuiz(currentQuiz));
    }

    public addChoice(text: string) {
        const currentConfig = this.mapView.get("quiz") as types.IConfiguration;
        const currentQuiz = ((currentConfig.components[0]) as types.IChoiceComponent).data as IQuiz;
        const currentChoices = currentQuiz.choices;
        const newChoice = {
            choice: text,
            feedback: "",
            id: currentChoices.length,
        };
        currentChoices.push(newChoice);
        this.mapView.set("quiz", this.serializeQuiz(currentQuiz));

        const responseMap = this.mapView.get("response") as IMap;
        responseMap.set(`0x${newChoice.id + 1}`, newChoice.choice);
    }

    private serializeQuiz(quiz: IQuiz): types.IConfiguration {
        return getConfiguration(quiz);
    }

    private createEmptyQuizConfig(): types.IConfiguration {
        const emptyQuiz: IQuiz = {
            allowChoiceEditing: true,
            allowMultipleAnswers: false,
            answer: null,
            choices: [],
            fontSize: "small",
            hasAnswer: false,
            hints: [],
            isTimed: false,
            limitAttempts: false,
            maxAttempts: 2,
            question: "Insert question here",
            required: false,
            shuffleChoices: false,
            timeLimit: 120,
        };
        return this.serializeQuiz(emptyQuiz);
    }
}
