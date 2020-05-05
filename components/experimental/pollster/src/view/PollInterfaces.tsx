/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@microsoft/fluid-map";

/**
 * Data structure for Poll option
 */
export interface PollOptionInfo {
    /**
   * The content of an option is the text displayed.
   */
    content: string;

    /**
   * Unique identifier for the option
   */
    id: string;
}

export interface VoteInfo {
    /**
   * Unique identifier for co-author who votes
   */
    clientId: string;

    /**
   * The previous option identifier used to remove his old choice
   */
    previousOptionId: string | undefined;

    /**
   * The current option identifier used to add his current choice
   */
    currentOptionId: string;
}

/**
 * Data needed creating a Poll component
 */
export interface PollStore {
    rootMap: ISharedMap;

    optionsMap: ISharedMap;

    votersMap: ISharedMap;
}
