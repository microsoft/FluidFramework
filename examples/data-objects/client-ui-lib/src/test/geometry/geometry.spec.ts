/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ui } from "../../";

describe("Routerlicious", () => {
    describe("UI", () => {
        describe("Geometry", () => {
            describe("Rectangle", () => {
                describe("#constructor()", () => {
                    it("Should be able to construct a Rectangle", () => {
                        const width = 400;
                        const height = 400;

                        const rectangle = new ui.Rectangle(0, 0, width, height);
                        assert.equal(rectangle.x, 0);
                        assert.equal(rectangle.y, 0);
                        assert.equal(rectangle.width, width);
                        assert.equal(rectangle.height, height);
                    });
                });
            });
        });
    });
});
