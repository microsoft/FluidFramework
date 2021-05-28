/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-unassigned-import, import/no-internal-modules */
import "jsdom-global/register";
import { Template } from "../template";

describe("", () => {
    it("", () => {
        const template = new Template({
            tag: "span",
            props: { textContent: "0" },
            children: [
                { tag: "span", ref: "0", props: { textContent: "00" } },
                { tag: "span", ref: "1", props: { textContent: "01" } },
                { tag: "span", ref: "2", props: { textContent: "02" } },
                { tag: "span", ref: "3", props: { textContent: "03" } },
            ],
        });

        const root = template.clone();
        const r0 = template.get(root, "0");
        const r1 = template.get(root, "1");
        const r2 = template.get(root, "2");
        const r3 = template.get(root, "3");

        console.log(r0.outerHTML);
        console.log(r1.outerHTML);
        console.log(r2.outerHTML);
        console.log(r3.outerHTML);
    });
});
