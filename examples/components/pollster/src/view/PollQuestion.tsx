/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { mergeStyles } from "office-ui-fabric-react";
import { ControlledInput } from "./Input";

const questionClassName = mergeStyles({
    fontSize: 25,
    fontFamily: "Segoe UI",
    marginBottom: 15,
    borderBottom: "1px solid #DCDCDC",
});

interface PollQuestionProps {
    question: string;

    onSubmitQuestion: (question: string) => void;
}

// eslint-disable-next-line react/display-name
export const PollQuestion = React.memo((props: PollQuestionProps) => {
    const { question, onSubmitQuestion } = props;

    // Pressing enter means the user is sure that he wants to submit the question to others
    return (
        <div>
            {question !== "" ? (
                <div className={questionClassName}>{question}</div>
            ) : (
                <ControlledInput placeholder={"Type your question here..."} submitValue={onSubmitQuestion} />
            )}
        </div>
    );
});
