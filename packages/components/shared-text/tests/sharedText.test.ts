/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { globals } from "../jest.config";

describe("sharedText", () => {
  jest.setTimeout(30000);

  beforeEach(async () => {
    await page.goto(globals.PATH, { waitUntil: "load" });
  });

  test("The title of the document is the same for both users", async() => {
    const getTitles = async (index: number) => {
      return page.evaluate((i: number) => {
        const titleElements = document.getElementsByClassName("title-bar");
            const title = titleElements[i] as HTMLDivElement;
            if (title) {
                return title.innerText;
            }

            return "";
      }, index);
    }

    // Get the titles of the two documents and verify they are the same.
    const titleLeft = await getTitles(0);
    expect(titleLeft).not.toEqual("");

    const titleRight = await getTitles(1);
    expect(titleLeft).toEqual(titleRight);
  });

  test("the text typed by one user updates the text for the other user", async() => {
    const getText = async (index: number) => {
      return page.evaluate((i: number) => {
        const titleElements = document.getElementsByClassName("flow-view");
            const title = titleElements[i] as HTMLDivElement;
            if (title) {
                return title.innerText;
            }

            return "";
      }, index);
    }

    const word: string = "sharedTextTest";
    // Type a word in one of the documents. There are two classes with name "flow-view",
    // one for each user. This will pick the first class it finds and type in that.
    await page.type('[class=flow-view]', word, {delay: 10});

    // The text returned has extra spaces and some characters showing the other user's cursor.
    // Remove the extra spaces and get the characters for the word we typed.
    let textLeft = await getText(0);
    expect(textLeft).not.toEqual("");
    textLeft = textLeft.replace(/\s/g,'');
    textLeft = textLeft.substring(0, word.length);

    let textRight = await getText(1);
    expect(textRight).not.toEqual("");
    textRight = textRight.replace(/\s/g,'');
    textRight = textRight.substring(0, word.length);

    // Verify that the text updated for both the users.
    expect(textLeft).toEqual(word);
    expect(textRight).toEqual(word);
  });
});
