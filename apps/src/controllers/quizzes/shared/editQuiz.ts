import * as $ from "jquery";
import * as ko from "knockout";
// import { Labs } from "./ext/labs";
import { Choice, Hint, IQuiz } from "./choice";
import { Quiz } from "./choiceQuiz";
import { ControlBarViewModel, ControlButton } from "./controlBar";
import { addCustomBindings } from "./customBindings";
import * as utils from "./utils";

interface IChoiceQuizState {
    seed: string;
    submission: any;
    feedbackChoices: number[];
}

//
// Add a popover binding to automatically apply the bootstrap bindings to the required elements
//
/*
TODO: bring binding back!
ko.bindingHandlers["popover"] = {
    init: (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) => {
        $(element).popover();
        $(element).on("click", (e) => {
            e.preventDefault();
            return true;
        });
    },
};
*/

function createCallback<T>(deferred: JQueryDeferred<T>): Labs.Core.ILabCallback<T> {
    return (err, data) => {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve(data);
        }
    };
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

// The edit view model. This is the view model used when editing choices.
// Primarily is just a wrapper around the quiz model.
// But also provides callbacks to add hints and choices.

class EditViewModel {
    public quiz: Quiz;
    public controlBar: ControlBarViewModel;

    private appViewModel: AppViewModel;
    private labEditor: Labs.LabEditor;

    // Variables used to implement quiz configuration throttling.
    private dirty = false;
    private timer = null;
    private pendingQuizData = null;

    constructor(appViewModel: AppViewModel, labEditor: Labs.LabEditor, quiz: Quiz) {
        this.appViewModel = appViewModel;
        this.quiz = quiz;
        this.labEditor = labEditor;

        this.initControlBar();

        quiz.allowMultipleAnswers.subscribe((allow) => {
            if (!allow && quiz.answer().length > 1) {
                quiz.answer([quiz.answer()[0]]);
            }
        });

        // Finally register for any change notifications on the quiz and serialize it
        quiz.serializedQuiz.subscribe((changedQuiz) => {
            // Update the pending quiz data
            this.pendingQuizData = changedQuiz;

            // If not already dirty, set the dirty bit and fire the update timer
            if (!this.dirty) {
                this.dirty = true;
                this.timer = setTimeout(() => { this.serializeQuiz(); }, 500);
            }
        });
    }

    public serializeQuiz() {
        if (this.dirty) {
            clearTimeout(this.timer);
            this.timer = null;
            this.dirty = false;

            this.labEditor.setConfiguration(getConfiguration(this.pendingQuizData), (err, unused) => {
                if (err) {
                    this.appViewModel.showError(err);
                }
            });
        }
    }

    public addChoice() {
        // Of the current choices, get the largest ID, and then add 1 to it for the new choice
        let greatestId = 0;
        this.quiz.choices().forEach((choice) => {
            const choiceId = choice.id();
            greatestId = Math.max(choiceId, greatestId);
        });

        this.quiz.choices.push(new Choice({ id: greatestId + 1, choice: null, feedback: null }));
    }

    public removeChoice(index: number) {
        const choices = this.quiz.choices();
        const removeId = choices[index].id();
        this.quiz.answer.remove(removeId.toString());

        this.quiz.choices.splice(index, 1);
    }

    public addHint() {
        this.quiz.hints.push(new Hint({ text: "" }));
    }

    public removeHint(index: number) {
        this.quiz.hints.splice(index, 1);
    }

    public flipAnswer(index: number) {
        const choiceIdStr = this.quiz.choices()[index].id().toString();
        if (!this.quiz.allowMultipleAnswers()) {
            if (this.quiz.answer.indexOf(choiceIdStr) >= 0) {
                return;
            } else {
                this.quiz.answer.removeAll();
                this.quiz.answer.push(choiceIdStr);
            }
        } else {
            if (this.quiz.answer.indexOf(choiceIdStr) >= 0) {
                this.quiz.answer.remove(choiceIdStr);
            } else {
                this.quiz.answer.push(choiceIdStr);
            }
        }
    }

    public isAnswer(index: number) {
        const choiceIdStr = this.quiz.choices()[index].id().toString();
        return this.quiz.answer.indexOf(choiceIdStr) !== -1;
    }

    public afterRender() {
        setTimeout(() => {
            $(":focus").blur();
            window.scrollTo(0, 0);
        }, 0);
    }

    private initControlBar() {
        this.controlBar = new ControlBarViewModel();
        this.controlBar.leftButtons.push(
            new ControlButton(
                "QuizTextPreview", () => this.appViewModel.switchMode(Labs.Core.LabMode.View, true), null));
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
    public labInstance: Labs.LabInstance;

    private appViewModel: AppViewModel;
    private seed: KnockoutObservable<string>;
    private labState: KnockoutComputed<IChoiceQuizState>;
    private attempt: Labs.Components.ChoiceComponentAttempt;

    constructor(
        appViewModel: AppViewModel,
        labInstance: Labs.LabInstance,
        configurationInstance: Labs.Components.ChoiceComponentInstance,
        attempt: Labs.Components.ChoiceComponentAttempt,
        state: any) {
        this.appViewModel = appViewModel;
        this.quiz = new Quiz(configurationInstance.component.data as IQuiz);
        this.attempt = attempt;
        this.labInstance = labInstance;

        // View state
        this.fontSize = ko.computed(() => {
            return "quiz-body-text-" + this.quiz.fontSize();
        });

        // Either setup the random number generator seed or get the currently set one
        const quizState = state ? state.data as IChoiceQuizState : null;
        // const seed = quizState ? quizState.seed : Math.seedrandom();
        // Math.seedrandom(seed);
        this.seed = ko.observable("seed");

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

        // The saved lab state is the seed and current set of submissions
        this.labState = ko.computed(() => {
            return { seed: this.seed(), submission: this.submission(), feedbackChoices: this.feedbackChoices() };
        });

        // Save the current state and subscribe to future updates
        labInstance.setState(this.labState(), (err, unused) => {
            if (err) {
                this.appViewModel.showError(err);
            }
        });
        this.labState.subscribe((newValue) => {
            labInstance.setState(newValue, (err, unused) => {
                if (err) {
                    this.appViewModel.showError(err);
                }
            });
        });

        const submissions = attempt.getSubmissions();

        // Setup the result field
        this.result = ko.observable("");
        this.result.extend({notify: "always"});
        const attemptState = this.attempt.getState();
        if (attemptState === Labs.ProblemState.Timeout) {
            this.result("timeout");
        } else {
            if (submissions.length > 0) {
                const lastSubmissions = submissions[submissions.length - 1];
                this.submission(lastSubmissions.answer.answer);

                if (this.quiz.hasAnswer()) {
                    this.result(lastSubmissions.result.score === 1 ? "correct" : "incorrect");
                } else {
                    this.result("submitted");
                }
            }
        }

        const hints = attempt.getValues("hints");
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
        this.timeRemaining = ko.observable(attemptState !== Labs.ProblemState.Timeout ? this.quiz.timeLimit() : 0);
        this.timeRemainingFormatted = ko.computed(() => {
            // const time = this.timeRemaining();
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
        //
        // If the quiz is timed setup timing information
        //
        if (attemptState === Labs.ProblemState.InProgress && this.quiz.isTimed()) {
            const startingTime = utils.getTimeInSeconds();
            this.intervalId = setInterval(() => {
                const currentTime = utils.getTimeInSeconds();
                const elapsedTime = currentTime - startingTime;
                const timeRemaining = Math.ceil(this.quiz.timeLimit() - elapsedTime);
                if (timeRemaining <= 0) {
                    clearInterval(this.intervalId);
                    this.intervalId = null;
                    this.result("timeout");
                    this.attempt.timeout((err, unused) => {
                        //
                    });
                }

                this.timeRemaining(timeRemaining);
            },
                1000);
        }

        this.initControlBar();
    }

    //
    // Called when the user clicks on the submit button.
    //
    public submit() {
        let submission = this.submission();
        const answer = this.quiz.answer();
        const choices = this.choices();

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

        // Update the attempts
        this.attemptsMade(this.attemptsMade() + 1);

        // Update the current attempt result
        const complete = correct || (this.quiz.limitAttempts() && this.attemptsRemaining() === 0);
        this.attempt.submit(
            new Labs.Components.ChoiceComponentAnswer(submission),
            new Labs.Components.ChoiceComponentResult(correct ? 1 : 0, complete),
            (err, result) => {
            if (err) {
                this.appViewModel.showError(err);
            }
        });
    }

    //
    // Called once the quiz is over and we can move on to the next lab
    //
    public done() {
        Labs.getTimeline().next({}, (err, unused) => {
            if (err) {
                if (err.hasOwnProperty("code") && err.code === 7004) {
                    // $("#advanceFromLastSlide").modal();
                } else {
                    this.appViewModel.showError(err);
                }
            }
        });
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
        this.controlBar.leftButtons.push(new ControlButton("QuizTextEdit",
            () => { this.appViewModel.switchMode(Labs.Core.LabMode.Edit, false); },
            () => this.appViewModel.isModeSetByAuthor()));

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
        } else {
            this.controlBar.rightButtons.push(
                new ControlButton("QuizTextEdit", () => { this.retry(); }, () => this.isFinished()));
        }
        this.controlBar.rightButtons.push(
            new ControlButton("QuizTextContinue", () => { this.done(); }, () => this.isFinished()));
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

    public defaultQuiz: IQuiz;
    public labEditor: Labs.LabEditor;
    public labInstance: Labs.LabInstance;
    public isModeSetByAuthor: KnockoutObservable<boolean>;

    private modeSwitchP: JQueryPromise<void> = $.when<void>();

    constructor(defaultQuiz: IQuiz) {
        this.defaultQuiz = defaultQuiz;

        // The view specifies what is the current view model to make use of
        this.view = ko.observable(new AppView("emptyTemplate", null));

        // Initialize the current mode
        this.isModeSetByAuthor = ko.observable(false);

        const quiz = new Quiz(this.defaultQuiz);
        this.view(new AppView("editTemplate", new EditViewModel(this, null, quiz)));
        // this.switchMode(Labs.Core.LabMode.Edit, false);

        // TODO: Pass an event handler to switch button?
        /*Labs.on(Labs.Core.EventTypes.ModeChanged, (data) => {
            const modeChangedEvent = data as Labs.Core.ModeChangedEventData;
            this.switchMode(Labs.Core.LabMode[modeChangedEvent.mode], false);
        });*/
    }

    /* trigerredInternally is true if an author clicks "Preview"/"Edit" button in PPT, otherwise it is set to false */
    public switchMode(mode: Labs.Core.LabMode, isModeSetByAuthor: boolean) {
        // wait for any previous mode switch to complete before performing the new one
        this.modeSwitchP = this.modeSwitchP.then(() => {
            const switchedStateDeferred = $.Deferred<void>();

            // End any existing operations
            if (this.labInstance) {
                this.labInstance.done(createCallback(switchedStateDeferred));
            } else if (this.labEditor) {
                // serialize any pending edit changes prior to switching the mode
                this.view().viewModel.serializeQuiz();

                this.labEditor.done(createCallback(switchedStateDeferred));
            } else {
                switchedStateDeferred.resolve();
            }

            // and now switch the state
            return switchedStateDeferred.promise().then(() => {
                this.labEditor = null;
                this.labInstance = null;

                if (mode === Labs.Core.LabMode.Edit) {
                    return this.switchToEditMode(isModeSetByAuthor);
                } else {
                    return this.switchToShowMode(isModeSetByAuthor);
                }
            });
        });

        // Display an error if it occurs
        this.modeSwitchP.fail((error) => {
            this.showError(error);
        });
    }

    public retry() {
        this.crateAndShowNewAttempt().fail((error) => {
            this.showError(error);
        });
    }

    public showError(error: any) {
        this.errorMessage(JSON.stringify(error));
        // $("#errorModal").modal();
    }

    private switchToEditMode(isModeSetByAuthor: boolean): JQueryPromise<void> {
        const editLabDeferred = $.Deferred<Labs.LabEditor>();
        Labs.editLab(createCallback(editLabDeferred));

        return editLabDeferred.promise().then((labEditor) => {
            this.labEditor = labEditor;

            const configurationDeferred = $.Deferred<Labs.Core.IConfiguration>();
            labEditor.getConfiguration(createCallback(configurationDeferred));

            return configurationDeferred.promise().then((configuration) => {
                const configurationReadyDeferred = $.Deferred<void>();

                // Construct the quiz from the saved configuration
                let quiz: Quiz;
                if (configuration) {
                    quiz = new Quiz(((configuration.components[0]) as Labs.Components.IChoiceComponent).data as IQuiz);
                    configurationReadyDeferred.resolve();
                } else {
                    // Store the configuration since we won't notice this change
                    labEditor.setConfiguration(
                        getConfiguration(this.defaultQuiz),
                        createCallback(configurationReadyDeferred));
                    quiz = new Quiz(this.defaultQuiz);
                }

                this.view(new AppView("editTemplate", new EditViewModel(this, labEditor, quiz)));
                this.isModeSetByAuthor(isModeSetByAuthor);

                return configurationReadyDeferred.promise();
            });
        });
    }

    private switchToShowMode(isModeSetByAuthor: boolean): JQueryPromise<void> {

        const takeLabDeferred = $.Deferred<Labs.LabInstance>();
        Labs.takeLab(createCallback(takeLabDeferred));

        return takeLabDeferred.promise().then((labInstance) => {
            this.labInstance = labInstance;

            const choiceComponentInstance = this.labInstance.components[0] as Labs.Components.ChoiceComponentInstance;
            const attemptsDeferred = $.Deferred<Labs.Components.ChoiceComponentAttempt[]>();
            choiceComponentInstance.getAttempts(createCallback(attemptsDeferred));
            const attemptP = attemptsDeferred.promise().then((attempts) => {
                const currentAttemptDeferred = $.Deferred();
                if (attempts.length > 0) {
                    currentAttemptDeferred.resolve(attempts[attempts.length - 1]);
                } else {
                    choiceComponentInstance.createAttempt(createCallback(currentAttemptDeferred));
                }

                return currentAttemptDeferred.then((currentAttempt: Labs.Components.ChoiceComponentAttempt) => {
                    const resumeDeferred = $.Deferred<void>();
                    currentAttempt.resume(createCallback(resumeDeferred));
                    return resumeDeferred.promise().then(() => {
                        return currentAttempt;
                    });
                });
            });

            return this.resumeAndShowAttempt(attemptP, choiceComponentInstance).then(() => {
                this.isModeSetByAuthor(isModeSetByAuthor);
            });
        });
    }

    private crateAndShowNewAttempt(): JQueryPromise<void> {
        const choiceComponentInstance = this.labInstance.components[0] as Labs.Components.ChoiceComponentInstance;

        const currentAttemptDeferred = $.Deferred();
        choiceComponentInstance.createAttempt(createCallback(currentAttemptDeferred));
        const attemptP = currentAttemptDeferred.then((currentAttempt: Labs.Components.ChoiceComponentAttempt) => {
            const resumeDeferred = $.Deferred<void>();
            currentAttempt.resume(createCallback(resumeDeferred));
            return resumeDeferred.promise().then(() => {
                return currentAttempt;
            });
        });

        return this.resumeAndShowAttempt(attemptP, choiceComponentInstance);
    }

    private resumeAndShowAttempt(
        attemptP: JQueryPromise<Labs.Components.ChoiceComponentAttempt>,
        choiceComponentInstance: Labs.Components.ChoiceComponentInstance): JQueryPromise<void> {
        const stateDeferred = $.Deferred<any>();
        this.labInstance.getState(createCallback(stateDeferred));

        return $.when(attemptP, stateDeferred.promise())
            .then((attempt: Labs.Components.ChoiceComponentAttempt, state: any) => {
            const deferred = $.Deferred<void>();
            this.view(
                new AppView(
                    "showTemplate",
                    new ShowViewModel(this, this.labInstance, choiceComponentInstance, attempt, state)),
                );
            // Call mathjax right after setting up the view
            MathJax.Hub.Queue(["Typeset", MathJax.Hub]);
            return deferred.resolve().promise();
        });
    }
}

//
// Method that given a quiz, returns the configuration sent to the server
//
function getConfiguration(quiz: IQuiz): Labs.Core.IConfiguration {
    const choices: Labs.Components.IChoice[] = [];

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

    const hints: Labs.Core.IValue[] = [];
    quiz.hints.forEach((hint) => {
        hints.push({ isHint: true, value: {"text/plain": hint.text } });
    });

    const choiceComponent: Labs.Components.IChoiceComponent = {
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
        type: Labs.Components.ChoiceComponentType,
        values: { hints },
    };

    return {
        analytics: null,
        appVersion: { major: 0, minor: 1 },
        components: [choiceComponent],
        name: "Choice question",
        timeline: null,
    };
}

//
// Quiz entry point. Once the document is ready attempts to establish a connection with Labs.js
//
export function initialize(defaultQuizConfiguration: IQuiz) {
    console.log(`Init called!`);
    $(document).ready(() => {
        console.log(`Document ready!`);
        // And initialize our view model
        const appViewModel = new AppViewModel(defaultQuizConfiguration);

        // add custom bindings
        addCustomBindings();

        // And start up knockout!
        ko.applyBindings(appViewModel);

    });
}
