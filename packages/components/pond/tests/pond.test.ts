/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("pond", () => {
    jest.setTimeout(10000);

    beforeEach(async () => {
      await page.goto(globals.PATH, { waitUntil: "load" });
    });

    it("There should be 3 buttons to be clicked", async () => {
        await expect(page).toClick("button", { text: "+1" });
        await expect(page).toClick("button", { text: "+10" });
        await expect(page).toClick("button", { text: "+5" });
    });

    it("Clicking the buttons updates both users", async () => {
      const getValue = async (index: number, classId: string) => {
        return page.evaluate((index: number, classId: string) => {
            const clickerElements = document.getElementsByClassName(classId);
            const clicker = clickerElements[index] as HTMLDivElement;
            if (clicker) {
                return clicker.innerText;
            }

            return "";
        }, index, classId);
      };

      // Validate both users have 5 as their value
      const preValue_51 = await getValue(0, "clicker-value-class-5+1");
      expect(preValue_51).toEqual("5");
      const preValue2_51 = await getValue(1, "clicker-value-class-5+1");
      expect(preValue2_51).toEqual("5");

      // Click the +1 button
      await expect(page).toClick("button", { text: "+1" });

      // Validate both users have 6 as their value
      const postValue_51 = await getValue(0, "clicker-value-class-5+1");
      expect(postValue_51).toEqual("6");
      const postValue2_51 = await getValue(1, "clicker-value-class-5+1");
      expect(postValue2_51).toEqual("6");

      // Validate both users have 0 as their value
      const preValue_010 = await getValue(0, "clicker-value-class-0+10");
      expect(preValue_010).toEqual("0");
      const preValue2_010 = await getValue(1, "clicker-value-class-0+10");
      expect(preValue2_010).toEqual("0");

      // Click the +10 button
      await expect(page).toClick("button", { text: "+10" });

      // Validate both users have 10 as their value
      const postValue_010 = await getValue(0, "clicker-value-class-0+10");
      expect(postValue_010).toEqual("10");
      const postValue2_010 = await getValue(1, "clicker-value-class-0+10");
      expect(postValue2_010).toEqual("10");

      // Validate both users have 100 as their value
      const preValue_1005 = await getValue(0, "clicker-value-class-100+5");
      expect(preValue_1005).toEqual("100");
      const preValue2_1005 = await getValue(1, "clicker-value-class-100+5");
      expect(preValue2_1005).toEqual("100");

      // Click the button
      await expect(page).toClick("button", { text: "+5" });

      // Validate both users have 105 as their value
      const postValue_1005 = await getValue(0, "clicker-value-class-100+5");
      expect(postValue_1005).toEqual("105");
      const postValue2_1005 = await getValue(1, "clicker-value-class-100+5");
      expect(postValue2_1005).toEqual("105");
    });
  });
