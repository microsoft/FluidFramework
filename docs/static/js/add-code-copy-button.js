/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Including this script on a page will add a Copy button to all code blocks.
// It determines a code block by looking for the "highlight" element.
// to include this script in your md file add `codeCopyButton: true` in the
// metadata at the top of the file

const copyMessage = "Copy";
const copyAriaLabel = "Copy this code snippet";

const addCopyButtonsToCodeBlocks = () => {
    // Ensure the browser supports copy
    if (!document.queryCommandSupported("copy")) {
        return;
    }

    const selectText = (node) => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
        return selection;
    };

    const addCopyButton = (element) => {
        const copyBtn = document.createElement("button");
        copyBtn.className = "highlight-copy-btn";
        copyBtn.textContent = copyMessage;
        copyBtn.ariaLabel = copyAriaLabel;
        copyBtn.ariaLive = "polite";
        copyBtn.type = "button";

        // Set a message on the button then return to the initial
        // value after 1 second
        const flashCopyMessage = (el, msg, label) => {
            el.textContent = msg;
            el.ariaLabel = label;
            setTimeout(() => {
                el.textContent = copyMessage;
                el.ariaLabel = copyAriaLabel;
            }, 1000);
        };

        const codeEl = element.firstElementChild;
        copyBtn.addEventListener("click", () => {
            try {
                const selection = selectText(codeEl);
                document.execCommand("copy");
                selection.removeAllRanges();

                flashCopyMessage(copyBtn, "Copied!", "Copied to the clipboard");
            } catch (e) {
                console && console.log(e);
                flashCopyMessage(copyBtn, "Failed", "Failed to copy");
            }
        });

        element.appendChild(copyBtn);
    };

    // Add copy button to code blocks
    const highlightBlocks = document.getElementsByClassName("highlight");
    Array.prototype.forEach.call(highlightBlocks, addCopyButton);
};

// Recursive function that checks to see if the page has loaded.
// Checks every 9ms and calls addCopyButtonsToCodeBlocks when loading is complete.
// Ensures we only attempt to add the Copy buttons after the elements exist
function checkPageLoaded() {
    document.readyState !== "complete"
        ? setTimeout(checkPageLoaded, 9)
        : addCopyButtonsToCodeBlocks();
}
checkPageLoaded();
