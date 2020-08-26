
// Including this script on a page will add a Copy button to all code blocks.
// It determines a code block by looking for the "highlight" element.

const copyMessage = "Copy";
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

        // Set a message on the button then return to the initial
        // value after 1 second
        const flashCopyMessage = (el, msg) => {
            el.textContent = msg;
            setTimeout(() => {
                el.textContent = copyMessage;
            }, 1000);
        };

        const codeEl = element.firstElementChild;
        copyBtn.addEventListener("click", () => {
            try {
                const selection = selectText(codeEl);
                document.execCommand("copy");
                selection.removeAllRanges();

                flashCopyMessage(copyBtn, "Copied!");
            } catch (e) {
                console && console.log(e);
                flashCopyMessage(copyBtn, "Failed");
            }
        });

        element.appendChild(copyBtn);
    };

    // Add copy button to code blocks
    const highlightBlocks = document.getElementsByClassName("highlight");
    Array.prototype.forEach.call(highlightBlocks, addCopyButton);
};

// Run the script after the page has been loaded
function r(f) {
    /in/.test(document.readyState) ? setTimeout("r(" + f + ")", 0) : f();
}
r(addCopyButtonsToCodeBlocks);
