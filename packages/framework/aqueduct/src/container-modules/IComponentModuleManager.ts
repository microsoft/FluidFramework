/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { Module, Scope } from "./types";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentModuleManager>> { }
}

export const IComponentModuleManager: keyof IProvideComponentModuleManager = "IComponentModuleManager";

export interface IProvideComponentModuleManager {
    IComponentModuleManager: IComponentModuleManager;
}

export interface IComponentModuleManager extends IProvideComponentModuleManager {
    parent: IComponentModuleManager | undefined;
    readonly registeredModules: Iterable<(keyof IComponent)>;
    register<T extends IComponent>(type: (keyof IComponent & keyof T), value: Module<T>): void;
    unregister<T extends IComponent>(type: (keyof IComponent & keyof T)): Module<T> | undefined;
    resolve<O extends IComponent, R extends IComponent = {}>(
        optionalTypes: Record<(keyof O & keyof IComponent), keyof IComponent>,
        requiredTypes: Record<(keyof R & keyof IComponent), keyof IComponent>,
    ): Scope<O, R>;
    has(types: keyof IComponent | (keyof IComponent)[]): boolean;
    resolveModule<T extends IComponent>(type: (keyof IComponent & keyof T)): Module<T> | undefined;
}
