/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../../ui";

export interface IShape {
    render(context2D: CanvasRenderingContext2D, offset: ui.IPoint);

    getBounds(): ui.Rectangle;
}
