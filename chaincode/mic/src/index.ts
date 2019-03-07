import { Component, Document } from "@prague/app-component";
import { IContainerContext, IRuntime, IVideoBlob } from "@prague/container-definitions";

export class mic extends Document {
  // Create the component's schema and perform other initialization tasks
  // (only called when document is initially created).
  protected async create() {
    return; 
  }

  // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
  public async opened() {
    // If the host provided a <div>, render the component into that Div
    const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
    if (!maybeDiv) {
      return;
    }

    await this.connected;

    if (this.root.has("recording")) {
      const vidTag = document.createElement("video");
      vidTag.setAttribute("controls", "");
      vidTag.src = this.root.get("recording");
      maybeDiv.appendChild(vidTag);
    } else {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

      const vidTag2 = document.createElement("video");
      vidTag2.setAttribute("playsinline", "");
      vidTag2.setAttribute("autoplay", "");
      vidTag2.setAttribute("muted", "");
      maybeDiv.appendChild(vidTag2);
      vidTag2.srcObject = mediaStream;

      const recorder = new MediaRecorder(mediaStream);
      recorder.start();

      const chunks = [];
      recorder.addEventListener("dataavailable", (event: any) => {
        chunks.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        const blob = new Blob(chunks);
        const url = URL.createObjectURL(blob);

        const fileReader = new FileReader();
        fileReader.onload = (event) => {
            const vidBlob: IVideoBlob = {
              type: "video",
              content: Buffer.from((event.target as any).result),
              fileName: "video",
              height: 600,
              length: 100,
              sha: "",
              size: blob.size,
              url: "",
              width: 800,
            };
            const uploadedP = this.runtime.uploadBlob(vidBlob);
            uploadedP.then((value) => {
              this.root.set("recording", value.url);
            });
        };
        fileReader.readAsArrayBuffer(blob);

        const videoTag = document.createElement("video");
        maybeDiv.appendChild(videoTag);
        videoTag.src = url;
        videoTag.play();

        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
      });

      setTimeout(() => {
        recorder.stop();
      }, 2000);
    }
  }
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return Component.instantiateRuntime(context, "@chaincode/counter", [
    ["@chaincode/counter", mic]
  ]);
}
