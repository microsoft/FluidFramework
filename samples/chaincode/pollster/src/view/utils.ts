/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";

export type AggregateVotesMap = Map<string /* optionId */, Set<string> /* votersIds */>;

export const aggregateVotes = (votersMap: ISharedMap): AggregateVotesMap => {
    const _votes: AggregateVotesMap = new Map<string, Set<string>>();

    votersMap.forEach((value, key) => {
        const optionId: string = value.currentOptionId;
        if (!_votes.has(optionId)) {
            _votes.set(value.currentOptionId, new Set<string>());
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        _votes.get(value.currentOptionId)!.add(key);
    });

    return _votes;
};
