import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Counter, CounterValueType } from "@prague/map";
import * as React from "react";
import * as ReactDOM from "react-dom";

export class mic extends Document {
  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    this.root.set("clicks", 0, CounterValueType.Name);
  }

  protected render(host: HTMLDivElement, counter: Counter) {
    ReactDOM.render(
      <div>
        <span>{counter.value}</span>
        <button onClick={() => counter.increment(1)}>+</button>
      </div>,
      host
    );
  }

  // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
  public async opened() {
    // If the host provided a <div>, render the component into that Div
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (!maybeDiv) {
      return;
    }

    const counter = await this.root.wait<Counter>("clicks");

    this.render(maybeDiv, counter);
    this.root.on("op", (ab) => {
      console.log(ab);
      this.render(maybeDiv, counter);
    });

    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const recorder = new MediaRecorder(mediaStream);

    recorder.start();

    const chunks = [];
    recorder.addEventListener("dataavailable", (event: any) => {
      chunks.push(event.data);
    });

    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      // const audio = new Audio(url);
      // audio.play();

      const videoTag = document.createElement("video");
      maybeDiv.appendChild(videoTag);
      videoTag.src = url;
      videoTag.play();
    });

    setTimeout(() => {
      recorder.stop();
    }, 5000);
  }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", mic]
  ]);
}
