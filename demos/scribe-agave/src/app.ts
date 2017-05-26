/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

// Easy access to a couple of page elements
const inputElement = document.getElementById("file") as HTMLInputElement;
const createButton = document.getElementById("create") as HTMLButtonElement;
const createDetails = document.getElementById("create-details") as HTMLElement;
const intervalElement = document.getElementById("interval") as HTMLInputElement;
const typingProgress = document.getElementById("typing-progress") as HTMLElement;
const typingProgressBar = typingProgress.getElementsByClassName("progress-bar")[0] as HTMLElement;

// Text represents the loaded file text
let text: string;

class RateCounter {
    private start: number;
    private value = 0;

    public increment(value: number) {
        this.value += value;
    }

    /**
     * Starts the counter
     */
    public reset() {
        this.value = 0;
        this.start = Date.now();
    }

    public elapsed(): number {
        return Date.now() - this.start;
    }

    /**
     * Returns the total accumulated value
     */
    public getValue(): number {
        return this.value;
    }

    /**
     * Returns the rate for the counter
     */
    public getRate(): number {
        return this.value / this.elapsed();
    }
};

inputElement.addEventListener(
  "change",
  () => {
    handleFiles(inputElement.files);
  },
  false);

function updateProgressBar(progressBar: HTMLElement, progress: number) {
  if (progress !== undefined) {
    progressBar.style.width = `${(100 * progress).toFixed(2)}%`;
    if (progress === 1) {
      progressBar.classList.remove("active");
    }
  }
}

function resetProgressBar(progressBar: HTMLElement) {
  progressBar.style.width = "0%";
  progressBar.classList.add("active");
}

function handleFiles(files: FileList) {
  if (files.length !== 1) {
    createButton.classList.add("hidden");
    createDetails.classList.add("hidden");
    return;
  }

  // prep the file reader to process the selected file
  const reader = new FileReader();
  reader.onload = (event) => {
    // After loading the file show the create button
    text = reader.result;
    createButton.classList.remove("hidden");
  };

  // Read the selected file
  const file = files.item(0);
  reader.readAsText(file);
}

(() => {
  // The initialize function must be run each time a new page is loaded
  Office.initialize = (reason) => {
    $(document).ready(() => {
      $('#text-form').submit(run);
    });
  };

  async function run(event: Event) {
    const intervalTime = Number.parseInt(intervalElement.value);

    // Initialize the scribe progress UI
    resetProgressBar(typingProgressBar);
    createDetails.classList.remove("hidden");
    let readPosition = 0;

    const typingCounter = new RateCounter();
    const samplingRate = 1000;

    const interval = setInterval(async () => {
      // Stop typing once we reach the end
      if (readPosition === text.length) {
          clearInterval(interval);
          return;
      }

      await Word.run(async (context) => {
        // Create a proxy object for the document body.
        var body = context.document.body;

        typingCounter.increment(1);
        if (typingCounter.elapsed() > samplingRate) {
            const rate = typingCounter.getRate() * 1000;
            typingCounter.reset();
            document.getElementById("typing-rate").innerText =
              `Typing rate: ${(rate).toFixed(2)} characters/second`;
        }

        // Start inserting text into the string
        // Queue a commmand to insert text in to the beginning of the body.
        body.insertText(text.charAt(readPosition++), Word.InsertLocation.end);
        updateProgressBar(typingProgressBar, readPosition / text.length);

        // Synchronize the document state by executing the queued commands,
        // and return a promise to indicate task completion.
        return context.sync().then(function () {
          console.log('Text added to the beginning of the document body.');
        });
      });
    }, intervalTime);

    event.preventDefault();
    event.stopPropagation();
  }
})();
