/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PropertySet } from "@microsoft/fluid-merge-tree";
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
        const userAttributes = { userId: "Fake User"};
        const documentId = "fakeId";
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedString: SharedString;
        let sharedStringWithInterception: SharedString;
        let componentContext: IComponentContext;

        function orderSequentially(callback: () => void): void {
            callback();
        }

        // Interception function that adds userProps to the passed props and returns.
        function propertyInterceptionCb(props?: PropertySet): PropertySet {
            const newProps = { ...props, ...userAttributes };
            return newProps;
        }

        // Function that verifies that the given shared string has correct value and the right properties at
        // the given position.
        function verifyString(ss: SharedString, text: string, props: PropertySet, position: number) {
            assert.equal(ss.getText(), text, "The retrieved text should match the inserted text");
            assert.deepEqual(
                ss.getPropertiesAtPosition(position),
                props,
                "The properties set via the interception callback should exist");
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
            sharedStringWithInterception =
                createSharedStringWithInterception(sharedString, componentContext, propertyInterceptionCb);
        });

        it("should be able to intercept SharedString methods by the wrapper", async () => {
            // Insert text into shared string.
            let text: string = "123";
            let syleProps: PropertySet = { style: "bold" };
            sharedStringWithInterception.insertText(0, text, syleProps);
            verifyString(sharedStringWithInterception, text, { ...syleProps, ...userAttributes }, 2);

            // Replace text in the shared string.
            text = "aaa";
            syleProps = { style: "italics "};
            sharedStringWithInterception.replaceText(2, 3, "aaa", syleProps);
            verifyString(sharedStringWithInterception, "12aaa", { ...syleProps, ...userAttributes }, 2);

            // Annotate the shared string.
            const colorProps = { color: "green" };
            sharedStringWithInterception.annotateRange(0, 5, colorProps);
            verifyString(sharedStringWithInterception, "12aaa", { ...syleProps, ...colorProps,...userAttributes }, 2);
        });

        it("should be able to see changes made by the wrapper from the underlying shared string", async () => {
            // Insert text via the shared string with interception wrapper.
            let text: string = "123";
            let syleProps: PropertySet = { style: "bold" };
            sharedStringWithInterception.insertText(0, text, syleProps);
            // Verify the text and properties via the underlying shared string.
            verifyString(sharedString, text, { ...syleProps, ...userAttributes }, 2);

            // Replace text via the shared string with interception wrapper.
            text = "aaa";
            syleProps = { style: "italics "};
            sharedStringWithInterception.replaceText(2, 3, "aaa", syleProps);
            // Verify the text and properties via the underlying shared string.
            verifyString(sharedString, "12aaa", { ...syleProps, ...userAttributes }, 2);

            // Annotate the shared string.
            const colorProps = { color: "green" };
            sharedStringWithInterception.annotateRange(0, 5, colorProps);
            // Verify the text and properties via the underlying shared string.
            verifyString(sharedString, "12aaa", { ...syleProps, ...colorProps, ...userAttributes }, 2);
        });

        it("should be able to see changes made by the underlying shared string from the wrapper", async () => {
            // Insert text via the underlying shared string.
            let text: string = "123";
            let syleProps: PropertySet = { style: "bold" };
            sharedString.insertText(0, text, syleProps);
            // Verify the text and properties via the interception wrapper. It should not have the user attributes.
            verifyString(sharedStringWithInterception, text, syleProps, 2);

            // Replace text via the underlying shared string.
            text = "aaa";
            syleProps = { style: "italics "};
            sharedString.replaceText(2, 3, "aaa", syleProps);
            // Verify the text and properties via the interception wrapper. It should not have the user attributes.
            verifyString(sharedStringWithInterception, "12aaa", syleProps, 2);

            // Annotate the shared string via the underlying shared string.
            const colorProps = { color: "green" };
            sharedString.annotateRange(0, 5, colorProps);
            // Verify the text and properties via the interception wrapper. It should not have the user attributes.
            verifyString(sharedStringWithInterception, "12aaa", { ...syleProps, ...colorProps}, 2);
        });
    });
});
