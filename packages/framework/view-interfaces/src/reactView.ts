/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated - See IComponentReactViewable
 */
export const IComponentReactViewable: keyof IProvideComponentReactViewable = "IComponentReactViewable";

/**
 * @deprecated - See IComponentReactViewable
 */
export interface IProvideComponentReactViewable {
    readonly IComponentReactViewable: IComponentReactViewable;
}
/**
 * Interface describing components that can produce React elements when requested.
 * @deprecated - To support multiview scenarios, consider split view/model patterns like those demonstrated in
 * the multiview sample.
 */
export interface IComponentReactViewable extends IProvideComponentReactViewable {
    /**
     * Create a React element.
     */
    createJSXElement(): JSX.Element;
}

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentReactViewable>> { }
}
