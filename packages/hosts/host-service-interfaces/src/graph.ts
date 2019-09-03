/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IGraphUser {
    // general access to user data
    [key: string]: any;
    businessPhones: string[];
    displayName: string;
    givenName: string;
    jobTitle: string;
    mail: string;
    mobilePhone: string;
    officeLocation: string;
    preferredLocation: string;
    surname: string;
    userPrincipalName: string;
    id: string;
}

export interface IProvideMicrosoftGraph {
    readonly IMicrosoftGraph: IMicrosoftGraph;
}

export interface IMicrosoftGraph extends IProvideMicrosoftGraph {
    me(): Promise<IGraphUser>;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideMicrosoftGraph>> {
    }
}
