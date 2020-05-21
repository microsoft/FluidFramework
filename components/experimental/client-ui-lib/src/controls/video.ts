/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import * as ui from "../ui";

export class Video extends ui.Component {
    private readonly message: HTMLSpanElement;
    private video: HTMLVideoElement;

    constructor(element: HTMLDivElement, private readonly videoMap: ISharedMap, src: string) {
        super(element);

        this.message = document.createElement("span");
        this.message.style.height = "auto";
        this.message.style.height = "auto";
        this.message.style.padding = "5px";
        this.message.style.borderRadius = "8px";
        this.message.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
        element.appendChild(this.message);

        this.video = document.createElement("video");
        this.video.src = src;
        this.video.controls = true;
        this.video.muted = true;
        element.appendChild(this.video);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.handleVideoMap();
        this.video.onplay = () => this.handlePlay();
        this.video.onpause = () => this.handlePause();
        this.video.ontimeupdate = () => this.handleTimeUpdate();
        this.video.onload = () => this.handleLoad();
    }

    public resizeCore(bounds: ui.Rectangle) {
        bounds.x = 0;
        bounds.y = 0;
        const overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
        overlayInnerRects[0].conformElement(this.message);
        overlayInnerRects[1].conformElement(this.video);
    }

    public playPause(play: boolean) {
        if (play) {
            if (this.video.paused) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.video.play();
            }
        } else {
            if (!this.video.paused) {
                this.video.pause();
            }
        }
    }

    public timeUpdate(time: number) {
        if (Math.abs(this.video.currentTime - time) > 5) {
            this.video.currentTime = time;
        }
    }

    private async handleVideoMap() {
        this.videoMap.get("time").then((time) => {
            if (!isNaN(time)) {
                this.video.currentTime = time;
            }
        });

        this.videoMap.get("play").then((play) => {
            this.playPause(play);
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.videoMap.on("valueChanged", async (changedValue) => {
            switch (changedValue.key) {
                case ("play"):
                    this.videoMap.get(changedValue.key).then((play) => this.playPause(play));
                    break;
                case ("time"):
                    this.videoMap.get(changedValue.key).then((time) => this.timeUpdate(time));
                    break;
                default:
                    break;
            }
        });
    }

    private handleLoad() {
        this.videoMap.get("time").then((time) => {
            this.video.currentTime = time;
        });
        this.videoMap.get("play").then((play) => {
            this.playPause(play);
        });
    }

    private handleTimeUpdate() {
        this.videoMap.set("time", this.video.currentTime);
    }

    private handlePlay() {
        this.videoMap.set("play", true);
    }

    private handlePause() {
        this.videoMap.set("play", false);
    }
}
