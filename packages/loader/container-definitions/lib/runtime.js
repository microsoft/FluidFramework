/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// Represents the attachment state of the entity.
export var AttachState;
(function (AttachState) {
    AttachState["Detached"] = "Detached";
    AttachState["Attaching"] = "Attaching";
    AttachState["Attached"] = "Attached";
})(AttachState || (AttachState = {}));
// Represents the bind state of the entity.
export var BindState;
(function (BindState) {
    BindState["NotBound"] = "NotBound";
    BindState["Binding"] = "Binding";
    BindState["Bound"] = "Bound";
})(BindState || (BindState = {}));
export const IRuntimeFactory = "IRuntimeFactory";
//# sourceMappingURL=runtime.js.map