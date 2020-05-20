/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInternalRegistryEntry } from ".";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentRegistryTemplates>> { }
}

export const IComponentRegistryTemplates: keyof IProvideComponentRegistryTemplates = "IComponentRegistryTemplates";

export interface IProvideComponentRegistryTemplates {
    readonly IComponentRegistryTemplates: IComponentRegistryTemplates;
}

/**
 * Provides functionality to retrieve subsets of an internal registry based on membership in a template.
 */
export interface IComponentRegistryTemplates extends IProvideComponentRegistryTemplates {
    getFromTemplate(template: Templates): IInternalRegistryEntry[];
}

export enum Templates {
    CollaborativeCoding = "Collaborative Coding",
    Classroom = "Classroom",
}
