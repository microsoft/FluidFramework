/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const IocTYPES = {
    SharedComponent: Symbol.for("SharedComponent"),
    IComponentRuntime: Symbol.for("IComponentRuntime"),
    IComponentContext: Symbol.for("IComponentContext"),
    IComponentFoo: Symbol.for("IComponentFoo"),
};

export { IocTYPES };
