/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { mergeStyles } from "office-ui-fabric-react";
import { OptionsMap } from "./Poll";
import { AggregateVotesMap } from "./utils";
import { PollOptionInfo } from "./PollInterfaces";

export interface PollOptionProps {
    option: PollOptionInfo;
    voters: Set<string>;
    onSubmitVote: (currentOptionId: string) => void;
}

interface OptionListProps {
    options: OptionsMap;
    votes: AggregateVotesMap;
    onVote: (currentOptionId: string) => void;
}

// eslint-disable-next-line react/display-name
export const OptionsList = React.memo((props: OptionListProps) => {
    const { options, votes, onVote } = props;
    const PollOptions: JSX.Element[] = [];

    options.forEach((value: PollOptionInfo, key: string) => {
        const voters = votes.get(key) || new Set<string>();
        PollOptions.push(<PollOption key={key} option={value} voters={voters} onSubmitVote={onVote} />);
    });

    return <div>{PollOptions}</div>;
});

export const PollOption = React.memo((props: PollOptionProps) => {
    const { option, voters, onSubmitVote } = props;

    const optionStyle = mergeStyles({
        padding: "3px",
        border: "1px solid #dcdcdc",
        cursor: "pointer",
        borderRadius: 0,
        marginBottom: "0.5em",
        display: "flex",
        flexFlow: "row nowrap",
        justifyContent: "space-between",
        alignItems: "center",
    });
    const voteClicked = () => {
        onSubmitVote(option.id);
    };
    return (
        <div className={optionStyle} onClick={voteClicked}>
            <div>{option.content}</div>
            <div>{voters.size}</div>
        </div>
    );
});
