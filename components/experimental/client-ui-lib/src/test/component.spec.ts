/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { JSDOM } from "jsdom";
import { ui } from "../";

class TestComponent extends ui.Component {
    protected resizeCore(rectangle: ui.Rectangle) {
        throw new Error("Method not implemented.");
    }
}

describe("Routerlicious", () => {
    describe("UI", () => {
        describe("Component", () => {
            let component: TestComponent;

            beforeEach(() => {
                const dom = new JSDOM("<!DOCTYPE html><p>Hello world</p>");
                const div = dom.window.document.createElement("div");
                component = new TestComponent(div);
            });

            describe(".getChildren()", () => {
                it("Should return the children of the component", () => {
                    assert.equal(0, component.getChildren());
                });
            });
        });
    });
});
