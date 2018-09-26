// tslint:disable
export const html = `
<div class="quiz-content">
    <div data-bind="template: { name: view().template, data: view().viewModel, afterRender: view().afterRender}">
    </div>

    <script type="text/html" id="emptyTemplate">
    </script>

    <script type="text/html" id="editTemplate">
        <div class="quiz-edit-container">
            <div class="page-header row">
                <div class="col-sm-10">
                    <span class="font-select-text"><span data-bind="localText: 'QuizTextSelectFontSize'"></span></span>&nbsp;&nbsp;&nbsp;
                    <input id="large-font-choice" class="font-select" type="radio" name="font-option" value="large" data-bind="checked: quiz.fontSize">
                    <label for="large-font-choice" class="quiz-font-selector quiz-font-large"><span>T</span></label>&nbsp;&nbsp;

                    <input id="medium-font-choice" class="font-select" type="radio" name="font-option" value="medium" data-bind="checked: quiz.fontSize">
                    <label for="medium-font-choice" class="quiz-font-selector quiz-font-medium"><span>T</span></label>&nbsp;&nbsp;

                    <input id="small-font-choice" class="font-select" type="radio" name="font-option" value="small" data-bind="checked: quiz.fontSize">
                    <label for="small-font-choice" class="quiz-font-selector quiz-font-small"><span>T</span></label>
                </div>
            </div>
            <form class="form-horizontal" role="form" data-bind="">
                <div class="row">
                    <div class="col-sm-10 col-xs-10">
                        <div id="richQuestionEditor" class="quiz-control quiz-question quiz-text-input" contenteditable="true" placeholder="Click to type question" data-bind="ckEditInliner: quiz.question, htmlValue: quiz.question"></div>
                    </div>
                    <div class="col-sm-2 col-xs-2">
                        <div class="quiz-right-options">
                            <!-- ko if: quiz.hasAnswer -->
                            <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/hint_32x32.svg" data-bind="click: addHint, localTooltip: { title: 'QuizTooltipAddHint', placement: 'bottom' }"/>
                            <!-- /ko -->
                        </div>
                    </div>
                </div>

                <!-- ko foreach: quiz.hints -->
                <div class="quiz-hint-container">
                    <div class="row row-hint">
                        <div class="col-sm-10 col-xs-10">
                            <div class="quiz-option-container">
                                <span class="quiz-input">
                                    <input type="text" class="quiz-control quiz-text-input quiz-hint" placeholder="Type to add hint"
                                        data-bind="attr: { id: 'hint' + ($index() + 1) }, value: text, valueUpdate: 'keyup', focusOnInit: text, event: {'keydown': Utils.filterKeys}" />
                                </span>
                            </div>
                        </div>
                        <div class="col-sm-2 col-xs-2">
                            <div class="quiz-right-options">
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/trashbox_32x32.svg" data-bind="click: function (data, event) { $parent.removeHint($index()); }" />
                            </div>
                        </div>
                    </div>
                </div>
                <!-- /ko -->
                
                <div class="row row-quiz-options">
                    <!-- ko if: quiz.allowChoiceEditing -->
                    <div class="col-sm-5">
                        <div class="quiz-option">
                            <label class="right-margin-20">
                                <input type="radio" name="allow-multiple-choices" value="single" data-bind="checked: quiz.multipleAnswerOption" /> 
                                    <span data-bind="localText: 'QuizTextSingleChoice'"></span>
                            </label>
                            <label>
                                <input type="radio" name="allow-multiple-choices" value="multiple" data-bind="checked: quiz.multipleAnswerOption" />
                                    <span data-bind="localText: 'QuizTextMultipleChoice'"></span>
                            </label>
                        </div>
                    </div>
                    <div class="col-sm-7">
                        <div class="quiz-option" data-bind="if: quiz.hasAnswer()">
                            <label class="right-margin-20">
                                <input type="checkbox" data-bind="checked: quiz.shuffleChoices" />
                                    <span data-bind="localText: 'QuizTextShuffle'"></span>
                            </label>
                        </div>
                        <div class="quiz-option" data-bind="if: quiz.hasAnswer()">
                            <label class="right-margin-20">
                                <input type="checkbox" data-bind="checked: quiz.allowRetries" />
                                    <span data-bind="localText: 'QuizTextAllowRetry'"></span>
                            </label>
                        </div>
                        <div class="quiz-option" data-bind="if: quiz.hasAnswer()">
                            <label>
                                <input type="checkbox" data-bind="checked: quiz.limitAttempts" />
                                    <span data-bind="localText: 'QuizTextLimit'"></span>
                            </label>
                        </div>
                        <!-- ko if: quiz.limitAttempts -->
                        <div class="quiz-option quiz-option-max-attempts">
                            <input type="text" class="" data-bind="value: quiz.maxAttempts" />
                        </div>
                        <!-- /ko -->
                    </div>
                    <!-- /ko -->
                    <!-- ko ifnot: quiz.allowChoiceEditing -->
                    <div class="quiz-option">
                        <label class="right-margin-20">
                            <input type="checkbox" data-bind="checked: quiz.allowRetries" />
                                <span data-bind="localText: 'QuizTextAllowRetry'"></span>
                        </label>
                    </div>
                    <!-- /ko -->
                </div>

                <!-- ko foreach: quiz.choices -->
                <div class="quiz-choice-container">
                    <div class="row row-quiz-choice">
                        <div class="quiz-input-wrapper col-sm-10 col-xs-10">
                            <div contenteditable="true" class="quiz-control quiz-choice quiz-text-input" placeholder="Click to type your answer" data-bind="attr: { id: 'richChoiceEditor' + ($index() + 1) }, ckEditInliner: choice, htmlValue: choice, css: { 'selected': $parent.isAnswer($index()) }, enable: $parent.quiz.allowChoiceEditing(), scrollToBottomOnInit: choice, focusOnInit: choice"></div>
                        </div>

                        <div class="col-sm-2 col-xs-2" >
                            <div class="quiz-right-options">
                                <!-- ko if: $parent.quiz.allowChoiceEditing -->
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/trashbox_32x32.svg" data-bind=" click: function (data, event) { $parent.removeChoice($index()); }"/>
                                <!-- /ko -->
                            
                                <!-- ko if: $parent.quiz.hasAnswer -->
                                <!-- ko if: feedback() === null -->
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/feedback_32x32.svg" data-bind="click: addFeedback, localTooltip: { title: 'QuizTooltipAddFeedback', placement: 'bottom' }"/>
                                <!-- /ko -->
                                <!-- ko ifnot: feedback() === null -->
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/feedback_disabled_32x32.svg" data-bind="click: function() {}" />
                                <!-- /ko -->
                                <!-- /ko -->

                                <!-- ko if: $parent.quiz.hasAnswer -->
                                <!-- ko ifnot: $parent.isAnswer($index())-->
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/answerchoice_32x32.svg" data-bind="click: function() {$parent.flipAnswer($index());}, localTooltip: { title: 'QuizTooltipSelectAnswer', placement: 'bottom' }"/>
                                <!-- /ko -->
                                <!-- ko if: $parent.isAnswer($index())-->
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/answerchoice_correct_32x32.svg" data-bind="click: function() {$parent.flipAnswer($index());}" />
                                <!-- /ko -->
                                <!-- /ko -->
                            </div>
                        </div>
                    </div>

                    <!-- ko if: feedback() != null -->
                    <div class="row row-quiz-feedback">
                        <div class="col-sm-10 col-xs-10">
                            <div class="arrow-up pull-right" />
                            <span class="quiz-input">
                                <input type="text" class="quiz-control quiz-text-input" placeholder="Type to add feedback" data-bind="value: feedback, valueUpdate: 'keyup', focusOnInit: feedback, event: {'keydown': Utils.filterKeys}" />
                            </span>
                        </div>
                        <div class="col-sm-2 col-xs-2" >
                            <div class="quiz-right-options">
                                <input type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/trashbox_32x32.svg" data-bind="click: removeFeedback" />
                            </div>
                        </div>
                    </div>
                    <!-- /ko -->
                </div>
                <!-- /ko -->
                <!-- ko if: quiz.allowChoiceEditing -->
                <div class="row row-add-choice">
                    <div class="col-sm-10 col-xs-10" data-bind="click:addChoice">
                        <div class="btn btn-add-choice">
                            <input class="quiz-input-add-choice" type="image" src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/add_choice_16x16.svg" />&nbsp;&nbsp;<span data-bind="localText: 'QuizTextAddAnswer'"></span>
                        </div>
                    </div>
                </div>
                <!-- /ko -->
            </form>
        </div>
        <div class="container-fluid">
            <div id="quiz-controls-container" data-bind="with: controlBar">
                <div class="row" id="quiz-controls">
                        <div class="btn-control-container">
                            <!-- ko foreach: leftButtons -->
                            <button class="btn btn-control" data-bind="visible: visible, css: {disabled: !enabled()}, click: click">
                                <span data-bind="localText: title"></span>
                            </button>
                            <!-- /ko -->
                        </div>
                        <div class="btn-control-container pull-right">
                            <!-- ko foreach: rightButtons -->
                            <button class="btn btn-control" data-bind="visible: visible, css: {disabled: !enabled()}, click: click">
                                <span data-bind="localText: title"></span>
                            </button>
                            <!-- /ko -->
                        </div>
                </div>
            </div>
        </div>
    </script>

    <script type="text/html" id="showTemplate">
        <div class="quiz-view-container">
            <div class="page-header row">
                <!-- ko if: quiz.limitAttempts -->
                <div class="quiz-attempts">
                    <div class="col-sm-10 col-xs-10">
                        <img src="https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/attempt_16x16.svg"/>
                        <span class="attempt-remaining-text" data-bind="text: attemptsRemaining"/>
                        <span data-bind="if: attemptsRemaining() > 1">
                            <span class="attempt-remaining-text" data-bind="localText: 'QuizTextAttemptsRemaining'"></span>
                        </span>
                        <span data-bind="if: attemptsRemaining() <= 1">
                            <span class="attempt-remaining-text" data-bind="localText: 'QuizTextAttemptRemaining'"></span>
                        </span>
                    </div>
                </div>
                <!-- /ko -->
            </div>
            <div class="row">
                <div class="col-sm-10 col-xs-10">
                    <div data-bind="css: fontSize">
                        <div tabindex="0" class="quiz-question quiz-text-box" data-bind="html: quiz.question"></div>
                    </div>
                </div>
                <div class="col-sm-2 col-xs-2">
                    <!-- ko if: result() -->
                    <div class="quiz-result-box quiz-text-box" data-bind="fade: result, css: {'correct': result() === 'correct', 'incorrect': result() === 'incorrect', 'submitted': result() === 'submitted'}">
                        <p data-bind="css: {'result-message-first': resultMessages()[1], 'result-message': !resultMessages()[1]}">
                            <span data-bind="localText: resultMessages()[0]"></span>
                        </p>
                        <p class="result-message-second">
                            <span data-bind="localText: resultMessages()[1]"></span>
                        </p>
                    </div>
                    <!-- /ko -->
                </div>
            </div>

            <!-- ko if: currentHint() !== 0 -->
            <div class="quiz-section quiz-hints">
                <!-- ko foreach: hints -->
                <div class="row row-hint">
                    <div class="col-sm-10 col-xs-10">
                        <div class="quiz-text-box quiz-hint" data-bind="text: text">
                        </div>
                    </div>
                </div>
                <!-- /ko -->
            </div>
            <!-- /ko -->

            <div class="row row-splitter-30"></div>

            <div class="quiz-choice-container" data-bind="css:fontSize">
                <!-- ko foreach: choices -->
                <div class="row row-quiz-choice">
                        <div aria-hidden="true" class="col-sm-10 col-xs-10">
                            <div class="quiz-text-box quiz-choice" data-bind="css: {'selected': $parent.isSelected($index())}, click: function() {$parent.flipSelection($index());}">
                                <span data-bind="html: choice.choice" class=""></span>
                            </div>
                        </div>
                        <div class="col-sm-2 col-xs-2 quiz-right-options">
                            <input role="checkbox" type="image" data-bind="attr: { 'aria-label': choice.choice(), 'aria-checked': $parent.isSelected($index())? 'true' : 'false', src: $parent.isSelected($index())? 'https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/answerchoice_correct_32x32.svg' : 'https://www.wu2-ppe.prague.office-int.com/public/quizzes/resources/answerchoice_unselected_32x32.svg'}, click: function() {$parent.flipSelection($index());}" data-toggle="tooltip" data-placement="bottom" />
                        </div>
                </div>
                <!-- ko if: showFeedback -->
                <div class="row row-quiz-feedback">
                    <div class="col-sm-10 col-xs-10">
                        <div class="arrow-up pull-right" />
                        <div data-bind="text: choice.feedback" class="quiz-text-box quiz-feedback"></div>
                    </div>
                </div>
                <!-- /ko -->
                <!-- /ko -->
            </div>

            <div class="container-fluid">
                <div id="quiz-controls-container" data-bind="with: controlBar">
                    <div class="row" id="quiz-controls">
                            <div class="btn-control-container">
                                <!-- ko foreach: leftButtons -->
                                <button class="btn btn-control" data-bind="visible: visible, css: {disabled: !enabled()}, click: click">
                                    <span data-bind="localText: title"></span>
                                </button>
                                <!-- /ko -->
                            </div>

                            <div class="btn-control-container pull-right">
                                <!-- ko foreach: rightButtons -->
                                <button class="btn btn-control" data-bind="visible: visible, css: {disabled: !enabled()}, click: click">
                                    <span data-bind="localText: title"></span>
                                </button>
                                <!-- /ko -->
                            </div>
                    </div>
                </div>
            </div>
        </div>
    </script>
</div>
`;
