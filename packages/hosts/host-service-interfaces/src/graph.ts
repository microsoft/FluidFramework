/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IGraphUser {
    // General access to user data
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

export const IMicrosoftGraph = "IMicrosoftGraph";

export interface IProvideMicrosoftGraph {
    readonly [IMicrosoftGraph]: IMicrosoftGraph;
}

export interface IMicrosoftGraph extends IProvideMicrosoftGraph {
    me(): Promise<IGraphUser>;
}

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideMicrosoftGraph>> { }
}
