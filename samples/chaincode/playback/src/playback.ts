/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Document } from "@prague/app-component";
import {
    IContainer,
    IDeltaQueue,
    ILoader,
    IPlatform,
    ISequencedDocumentMessage,
    IVideoBlob,
} from "@prague/container-definitions";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import * as qs from "querystring";
import { parse } from "url";

class PlaybackPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLDivElement) {
        super();
    }

    public async queryInterface(id: string): Promise<any> {
        if (id === "div") {
            return this.div;
        } else {
            return null;
        }
    }

    public detach() {
        throw new Error("Method not implemented.");
    }
}

class DeltaQueueManager {
    public timestamps = new Map<number, number>();
    private resolve: () => void;

    constructor(private q: IDeltaQueue<ISequencedDocumentMessage>) {
        this.q.on("op", (op: ISequencedDocumentMessage) => {
            this.timestamps.set(op.sequenceNumber, op.timestamp);
            this.q.pause();
            this.resolve();
        });
    }

    /**
     * Allows for the provided number of messages to be processed and then pauses the queue
     */
    public take(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.resolve = resolve;
            this.q.resume();
        });
    }
}

class PlaybackDeltaQueueManager {
    public targetOp: ISequencedDocumentMessage;

    private resolve: () => void;
    private target: number;
    private startTime: number;
    private upperTime: number;

    constructor(private q: IDeltaQueue<ISequencedDocumentMessage>) {
        this.q.on("op", (op: ISequencedDocumentMessage) => {
            if (op.sequenceNumber === this.target) {
                this.targetOp = op;
                this.startTime = op.timestamp;
                this.q.pause();
                this.resolve();
            }

            if (this.q.peek().timestamp - this.startTime > this.upperTime) {
                this.q.pause();
            }
        });
    }

    public runTo(sequenceNumber: number) {
        return new Promise<void>((resolve) => {
            this.target = sequenceNumber;
            this.resolve = resolve;
            this.q.resume();
        });
    }

    public updateTimeBound(time: number) {
        this.upperTime = time * 1000;

        if (this.q.length > 0 && this.q.paused) {
            if (this.q.peek().timestamp - this.startTime <= this.upperTime) {
                this.q.resume();
            }
        }
    }
}

export class Playback extends Document {
    // The component has been loaded. Attempt to get a div from the host. TODO explain this better.
    public async opened() {
        // If the host provided a <div>, render the component into that Div
        const maybeDiv = await this.platform.queryInterface<HTMLDivElement>("div");
        if (!maybeDiv) {
            return;
        }

        await this.connected;
        await this.root.wait("code");
        const codeUrl = this.root.get("code");

        if (this.root.has("recording")) {
            const codeDiv = document.createElement("div");
            maybeDiv.appendChild(codeDiv);
            const recording = this.root.get("recording");

            const videoDiv = document.createElement("div");
            maybeDiv.appendChild(videoDiv);
            videoDiv.style.position = "absolute";
            videoDiv.style.right = "0px";
            videoDiv.style.bottom = "0px";

            const codeContainerP = this.playbackCode(
                this.runtime.loader,
                codeUrl,
                new PlaybackPlatform(codeDiv),
                recording.sequenceNumber,
                recording.video,
                videoDiv);
            await codeContainerP;
        } else {
            const startButton = document.createElement("button");
            startButton.innerText = "Record";
            const stopButton = document.createElement("button");
            stopButton.innerText = "Stop";
            maybeDiv.appendChild(startButton);
            startButton.disabled = true;
            maybeDiv.appendChild(stopButton);
            stopButton.disabled = true;

            const codeDiv = document.createElement("div");
            maybeDiv.appendChild(codeDiv);

            const codeContainerP = this.attachCode(this.runtime.loader, codeUrl, new PlaybackPlatform(codeDiv));
            const container = await codeContainerP;
            startButton.disabled = false;
            stopButton.disabled = false;
            startButton.onclick = () => this.record(maybeDiv, stopButton, container.container, container.dqm);
        }
    }

    // Create the component's schema and perform other initialization tasks
    // (only called when document is initially created).
    protected async create() {
        const windowUrl = parse(window.location.href);
        const url = `${windowUrl.protocol}//${windowUrl.host}/loader/prague/code${Date.now()}`;
        const code = await this.runtime.loader.resolve({ url });

        // Wait for connection so that proposals  can be sent
        if (!(code as any).connected) {
            await new Promise<void>((resolve) => code.on("connected", () => resolve()));
        }

        // TODO URL params should be available at the time of create
        const queryString = qs.parse(windowUrl.search ? windowUrl.search.substr(1) : "");
        const pkg = queryString.cc ? queryString.cc as string : "@container/monaco@0.1.3";

        await code.getQuorum().propose("code2", pkg);

        this.root.set("code", url);
    }

    private async record(
        maybeDiv: HTMLDivElement,
        stop: HTMLButtonElement,
        container: IContainer,
        dqm: DeltaQueueManager,
    ) {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        const recorder = new MediaRecorder(mediaStream);
        recorder.start();
        const startSeqNum = container.deltaManager.referenceSequenceNumber;
        const timestamp = dqm.timestamps.get(startSeqNum);

        console.log("Starting record at " + startSeqNum);

        const chunks = [];
        recorder.addEventListener("dataavailable", (event: any) => {
            chunks.push(event.data);
        });

        recorder.addEventListener("stop", () => {
            const blob = new Blob(chunks);

            const fileReader = new FileReader();
            fileReader.onload = (event) => {
                const vidBlob: IVideoBlob = {
                    content: Buffer.from((event.target as any).result),
                    fileName: "video",
                    height: 600,
                    length: 100,
                    sha: "",
                    size: blob.size,
                    type: "video",
                    url: "",
                    width: 800,
                };
                const uploadedP = this.runtime.uploadBlob(vidBlob);
                uploadedP.then((value) => {
                    this.root.set(
                        "recording",
                        {
                            sequenceNumber: startSeqNum,
                            timestamp,
                            video: value.url,
                        });
                });
            };
            fileReader.readAsArrayBuffer(blob);

            for (const track of mediaStream.getTracks()) {
                track.stop();
            }
        });

        stop.onclick = () => {
            recorder.stop();
        };
    }

    private async playbackCode(
        loader: ILoader,
        url: string,
        platform: IPlatform,
        seqNum: number,
        videoUrl: string,
        videoDiv: HTMLDivElement,
    ): Promise<IContainer> {
        const response = await loader.resolve({
            headers: { connect: "open,pause", version: null },
            url,
        });

        const dqm = new PlaybackDeltaQueueManager(response.deltaManager.inbound);
        await dqm.runTo(seqNum);
        this.registerAttach(response, url, platform);

        const vidTag = document.createElement("video");
        vidTag.setAttribute("controls", "");
        vidTag.setAttribute("autoplay", "");
        vidTag.src = videoUrl;
        videoDiv.appendChild(vidTag);
        vidTag.addEventListener("timeupdate", (event) => {
            dqm.updateTimeBound(vidTag.currentTime);
        });

        return response;
    }

    private async attachCode(
        loader: ILoader,
        url: string,
        platform: IPlatform,
    ): Promise<{ container: IContainer, dqm: DeltaQueueManager }> {
        const response = await loader.resolve({
            headers: { connect: "open,pause", version: null },
            url,
        });

        const dqm = new DeltaQueueManager(response.deltaManager.inbound);
        response.deltaManager.outbound.resume();
        this.takeMessage(dqm);

        this.registerAttach(response, url, platform);

        return { container: response, dqm };
    }

    private takeMessage(dqm: DeltaQueueManager) {
        dqm.take().then(() => this.takeMessage(dqm));
    }

    private async attachPlatform(container: IContainer, url: string, platform: IPlatform) {
        const response = await (container as any).request({ url: "/" });

        if (response.status !== 200) {
            return;
        }

        switch (response.mimeType) {
            case "prague/component":
                const component = response.value as IComponentRuntime;
                component.attach(platform);
                break;
        }
    }

    private async registerAttach(container: IContainer, uri: string, platform: IPlatform) {
        this.attachPlatform(container, uri, platform);
        container.on("contextChanged", (value) => {
            this.attachPlatform(container, uri, platform);
        });
    }
}
