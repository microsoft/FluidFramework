/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentSummarizer>> { }
}

export const IComponentSummarizer: keyof IProvideComponentSummarizer = "IComponentSummarizer";

export interface IProvideComponentSummarizer {
    readonly IComponentSummarizer: IProvideComponentSummarizer
}
/**
 * A shared component has a URL from which it can be referenced
 */
export interface IComponentSummarizer extends IProvideComponentSummarizer {
    // Absolute URL to the component within the document
    readonly url: string;
}
