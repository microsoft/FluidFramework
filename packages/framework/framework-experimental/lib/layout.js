/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export const IComponentLayout = "IComponentLayout";
/**
 * Direction from which the cursor has entered or left a component.
 */
export var ComponentCursorDirection;
(function (ComponentCursorDirection) {
    ComponentCursorDirection[ComponentCursorDirection["Left"] = 0] = "Left";
    ComponentCursorDirection[ComponentCursorDirection["Right"] = 1] = "Right";
    ComponentCursorDirection[ComponentCursorDirection["Up"] = 2] = "Up";
    ComponentCursorDirection[ComponentCursorDirection["Down"] = 3] = "Down";
    ComponentCursorDirection[ComponentCursorDirection["Airlift"] = 4] = "Airlift";
    ComponentCursorDirection[ComponentCursorDirection["Focus"] = 5] = "Focus";
})(ComponentCursorDirection || (ComponentCursorDirection = {}));
export const IComponentCursor = "IComponentCursor";
export const IComponentKeyHandlers = "IComponentKeyHandlers";
//# sourceMappingURL=layout.js.map