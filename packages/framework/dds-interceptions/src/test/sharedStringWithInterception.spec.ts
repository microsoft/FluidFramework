/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { SharedString, SharedStringFactory } from "@microsoft/fluid-sequence";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { createSharedStringWithInterception } from "../sequence";

describe("Shared String with Interception", () => {
    /**
     * The following tests test simple user attribution in SharedString with interception.
     * In the callback function of the SharedString with interception, it adds the user
     * information to the passed properties and returns it.
     */
    describe("Simple User Attribution", () => {
        const userId = "Fake User";
        const documentId = "fakeId";
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedString: SharedString;
        let componentContext: IComponentContext;

        function orderSequentially(callback: () => void): void {
            callback();
        }

        beforeEach(() => {
            const runtime = new MockRuntime();
            deltaConnectionFactory = new MockDeltaConnectionFactory();
            sharedString = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
            runtime.services = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(undefined),
            };
            runtime.attach();

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            componentContext = { hostRuntime: { orderSequentially } } as IComponentContext;
        });

        function propertyInterceptionCb(props?: MergeTree.PropertySet): MergeTree.PropertySet {
            const newProps = { ...props, userId };
            return newProps;
        }

        it("should be able to intercept SharedString methods by the interception", async () => {
            const sharedStringWithInterception =
                createSharedStringWithInterception(sharedString, componentContext, propertyInterceptionCb);

            // Insert text into shared string.
            sharedStringWithInterception.insertText(0, "123", { style: "bold" });
            assert.equal(sharedStringWithInterception.getText(), "123", "The text should match the inserted text");

            const props = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(props.style, "bold", "The style set via insertText should exist");
            assert.equal(props.userId, userId, "The userId set via interception callback should exist");

            // Replace text in the shared string.
            sharedStringWithInterception.replaceText(2, 3, "aaa", { style: "italics" });
            assert.equal(sharedStringWithInterception.getText(), "12aaa", "The text should match the replaced text");

            const propsAfterReplace = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(propsAfterReplace.style, "italics", "The new style set via replaceText should exist");
            assert.equal(propsAfterReplace.userId, userId, "The userId set via interception callback should exist");

            // Annotate the shared string.
            sharedStringWithInterception.annotateRange(0, 5, { color: "green" });

            const propsAfterAnnotate = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(propsAfterAnnotate.style, "italics", "The previous style should exist");
            assert.equal(propsAfterAnnotate.color, "green", "The color set via annotateRange should exist");
            assert.equal(propsAfterAnnotate.userId, userId, "The userId set via interception callback should exist");
        });

        it("should be able to see changes made by the interception from the underlying shared string", async () => {
            const sharedStringWithInterception =
                createSharedStringWithInterception(sharedString, componentContext, propertyInterceptionCb);

            // Insert text via the shared string with interception.
            sharedStringWithInterception.insertText(0, "123", { style: "bold" });

            // Get the text and properties via the underlying shared string.
            assert.equal(sharedString.getText(), "123", "The text should match the inserted text");
            const props = sharedString.getPropertiesAtPosition(2);
            assert.equal(props.style, "bold", "The style set via insertText should exist");
            assert.equal(props.userId, userId, "The userId set via interception callback should exist");

            // Replace text via the shared string with interception.
            sharedStringWithInterception.replaceText(2, 3, "aaa", { style: "italics" });

            // Get the text and properties via the underlying shared string.
            assert.equal(sharedString.getText(), "12aaa", "The text should match the replaced text");
            const propsAfterReplace = sharedString.getPropertiesAtPosition(2);
            assert.equal(propsAfterReplace.style, "italics", "The new style set via replaceText should exist");
            assert.equal(propsAfterReplace.userId, userId, "The userId set via interception callback should exist");

            // Annotate via the shared string with interception.
            sharedStringWithInterception.annotateRange(0, 5, { color: "green" });

            // Get the text and properties via the underlying shared string.
            const propsAfterAnnotate = sharedString.getPropertiesAtPosition(2);
            assert.equal(propsAfterAnnotate.style, "italics", "The previous style should exist");
            assert.equal(propsAfterAnnotate.color, "green", "The color set via annotateRange should exist");
            assert.equal(propsAfterAnnotate.userId, userId, "The userId set via interception callback should exist");
        });

        it("should be able to see changes made by the underlying shared string from the interception", async () => {
            const sharedStringWithInterception =
                createSharedStringWithInterception(sharedString, componentContext, propertyInterceptionCb);

            // Insert text via the underlying shared string.
            sharedString.insertText(0, "123", { style: "bold" });

            // Get the text and properties via the shared string interception.
            assert.equal(sharedStringWithInterception.getText(), "123", "The text should match the inserted text");
            const props = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(props.style, "bold", "The style set via insertText should exist");
            // The userId should not exist because there should be no interception.
            assert.equal(props.userId, undefined, "The userId should not exist because there was no interception");

            // Replace text via the underlying shared string.
            sharedString.replaceText(2, 3, "aaa", { style: "italics" });

            // Get the text and properties via the shared string interception.
            assert.equal(sharedStringWithInterception.getText(), "12aaa", "The text should match the replaced text");
            const propsAfterReplace = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(propsAfterReplace.style, "italics", "The new style set via replaceText should exist");
            // The userId should not exist because there should be no interception.
            assert.equal(props.userId, undefined, "The userId should not exist because there was no interception");

            // Annotate via the underlying shared string.
            sharedString.annotateRange(0, 5, { color: "green" });

            // Get the text and properties via the shared string with interception.
            const propsAfterAnnotate = sharedStringWithInterception.getPropertiesAtPosition(2);
            assert.equal(propsAfterAnnotate.style, "italics", "The previous style should exist");
            assert.equal(propsAfterAnnotate.color, "green", "The color set via annotateRange should exist");
            // The userId should not exist because there should be no interception.
            assert.equal(props.userId, undefined, "The userId should not exist because there was no interception");
        });
    });
});
