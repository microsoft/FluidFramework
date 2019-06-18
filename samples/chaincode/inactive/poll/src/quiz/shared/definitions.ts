/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Split into separate files.
// Wrapper stuff

export enum LabMode {
    Edit = 0,
    View = 1,
}

export interface IUserData {
    data?: any;
}

export interface IVersion {
    major: number;
    minor: number;
}

export interface ILabObject {
    type: string;
}

export interface IValue {
    isHint: boolean;
    value: {
        [type: string]: any;
    };
}

export interface IComponent extends ILabObject, IUserData {
    name: string;
    values: {
        [type: string]: IValue[];
    };
}

export interface ITimelineConfiguration {
    duration: number;
    capabilities: string[];
}

export interface IConfiguration extends IUserData {
    appVersion: IVersion;
    components: IComponent[];
    name: string;
    timeline: ITimelineConfiguration;
    analytics: any;
}

// Quiz specific stuff (Edit)
export interface IChoice {
    id: string;
    content: {
        [type: string]: any;
    };
    name: string;
    value: any;
}

export interface IChoiceComponent extends IComponent {
    question: {
        [type: string]: any;
    };
    choices: IChoice[];
    timeLimit: number;
    maxAttempts: number;
    maxScore: number;
    hasAnswer: boolean;
    answer: any;
    secure: boolean;
}

// Quiz specific stuff (View)
export interface IValueInstance {
    valueId: string;
    isHint: boolean;
    hasValue: boolean;
    value?: {
        [type: string]: any;
    };
}
export interface IComponentInstance extends ILabObject, IUserData {
    componentId: string;
    name: string;
    values: {
        [type: string]: IValueInstance[];
    };
}

export interface IChoiceComponentInstance extends IComponentInstance {
    question: {
        [type: string]: any;
    };
    choices: IChoice[];
    timeLimit: number;
    maxAttempts: number;
    maxScore: number;
    hasAnswer: boolean;
    answer: any;
    secure: boolean;
}
