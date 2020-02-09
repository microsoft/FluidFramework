/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentClicks>> { }
}

export interface IProvideComponentClicks {
    readonly IComponentClicks: IComponentClicks;
}

export interface IComponentClicks extends IProvideComponentClicks {
    onClick(callback: () => void);
}
