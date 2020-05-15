/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

describe("scheduleIt", () => {
    jest.setTimeout(10000);

    it("Renders the schedule-it app", async () => {
        const scheduleItElement = document.getElementById("schedule-it-app");
        await expect(scheduleItElement).toBeDefined();
    });
});
