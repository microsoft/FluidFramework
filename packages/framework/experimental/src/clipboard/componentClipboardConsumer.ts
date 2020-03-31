/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentClipboardConsumer>> { }
}

export const IComponentClipboardConsumer = "IComponentClipboardConsumer";

export interface IProvideComponentClipboardConsumer {
    readonly [IComponentClipboardConsumer]: IComponentClipboardConsumer;
}

/**
 * On paste, the target of the paste event should do the following:
 *  1. Insert appropriate internal data for the content being pasted
 *  2. Either create nested components based on their **fluidUrlAttributeName** data- attribute found
 *  in the clipboard content, or, alternatively just use the HTML representation of that nested component
 *  any way they wish.
 *
 * Components may implement **IComponentClipboardConsumer.getComponentFromClipboardHTML** to provide an
 * alternate component identifier to be instantiated during the paste operation. This alternate component
 * should be instantiated on paste instead of the original component component identifier that was serialized
 * on copy. In essence, the first instantiated component (serialized component identifier) may act as a
 * factory for the component that will actually be instantiated.
 *
 * Disclaimer: These interfaces are experimental and are subject to change.
 */
export interface IComponentClipboardConsumer extends IProvideComponentClipboardConsumer {
    /**
   * Provide an alternate component identifier to be instantiated during the paste operation.
   * @alpha
   * @param targetContext - IComponentContext of the target
   * @param clipboardHTML - the html string that serialized by the component to the system clipboard.
   */
    getComponentFromClipboardHTML(
        targetContext: IComponentContext,
        clipboardHTML: string | undefined,
    ): Promise<string | undefined>;
}
