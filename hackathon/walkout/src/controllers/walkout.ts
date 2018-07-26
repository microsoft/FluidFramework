import { api as prague } from "@prague/routerlicious";
import * as async from "async";
import * as escape from "escape-html";
import * as jwt from "jsonwebtoken";
import SvgText from "svg-text";
import { rev } from "../constants";
import { VideoDocument } from "../documents";
import * as gh from "../github";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

class VideoPlayer {
    private player: any;
    private playbackQueue: async.AsyncQueue<gh.IPushHook>;
    private videoDocMap = new Map<string, Promise<VideoDocument>>();
    private playDeferred: prague.utils.Deferred<void>;

    constructor(YT, divId: string) {
        this.player = new YT.Player(
            divId,
            {
                events: {
                    onReady: () => {
                        this.playbackQueue.resume();
                    },
                    onStateChange: (event) => {
                        if (event.data === YT.PlayerState.ENDED) {
                            if (this.playDeferred) {
                                this.playDeferred.resolve();
                                this.playDeferred = null;
                            }
                        }
                    },
                },
                height: "100%",
                playerVars: {
                    controls: 0,
                },
                width: "100%",
            });

        this.playbackQueue = async.queue<gh.IPushHook, any>(
            (work, callback) => {
                this.playVideo(work)
                    .catch(() => { return; })
                    .then(() => callback());
            },
            1);
        this.playbackQueue.pause();
    }

    public addToPlaylist(hook: gh.IPushHook) {
        this.playbackQueue.push(hook);
    }

    private async playVideo(hook: gh.IPushHook) {
        const commit = hook.commits[0];
        const author = commit.author;

        const id = author.username;
        if (!this.videoDocMap.has(id)) {
            const videoP = VideoDocument.Load(id, tenantId, secret);
            this.videoDocMap.set(id, videoP);
        }
        const video = await this.videoDocMap.get(id);

        let rects = "";
        let firstDraw = "";
        let secondDraw = "";
        let defs = "";
        const height = 60;
        const smallHeight = 30;
        let y = height;
        const x = 10;
        let index = 1;
        const delayDelta = 0.5;

        // const measureOuter = document.getElementById("measure");
        // measureOuter.innerHTML = `<svg id="measureSvg" width="60%" height="1000px"></svg>`;
        const measureElement = document.getElementById("measureSvg");

        const splitLines = commit.message.split("\n").map((text) => ({ text, class: "" }));
        splitLines.push({ text: author.email, class: "small" });

        const lines = new Array<{ text: string, class: string, lineHeight: number }>();
        for (const line of splitLines) {
            const lineHeight = line.class === "small" ? smallHeight : height;
            const text = new SvgText({
                element: measureElement,
                maxWidth: window.innerWidth / 2,
                style: { "font-family": "Arial, sans-serif", "font-size": `${lineHeight}px` },
                text: line.text,
            }).text as SVGTextElement;

            for (const childNode of text.childNodes) {
                lines.push({
                    class: line.class,
                    lineHeight,
                    text: escape(childNode.textContent),
                });
            }
        }

        let firstDelay = 0;
        let secondDelay = lines.length * delayDelta;
        for (const line of lines) {
            // We compute again to get accurate sizing fo the tspan
            const bbox = new SvgText({
                element: measureElement,
                maxWidth: window.innerWidth / 2,
                style: { "font-family": "Arial, sans-serif", "font-size": `${line.lineHeight}px` },
                text: line.text,
            }).text.getBBox();

            // tslint:disable:max-line-length
            // Super cool SVG animation from https://codepen.io/supah/pen/vXyBza?editors=1111 and part of
            // https://speckyboy.com/css-javascript-text-animation-snippets/
            const rect = `<rect x="${bbox.x + x}" y="${bbox.y + y}" width="${bbox.width}" height="${bbox.height}" style="fill:rgb(0,0,0);stroke-width:10;stroke:rgb(0,0,0);" />`;
            const firstText = `<text text-anchor="start" x="${x}" y="${y}" class="text text-stroke ${line.class}" clip-path="url(#text${index})" style="-webkit-animation-delay: ${firstDelay}s; animation-delay: ${firstDelay}s;">${line.text}</text>`;
            const secondText = `<text text-anchor="start" x="${x}" y="${y}" class="text text-stroke text-stroke-2 ${line.class}" clip-path="url(#text${index})" style="-webkit-animation-delay: ${secondDelay}s; animation-delay: ${secondDelay}s;">${line.text}</text>`;
            const clipPath = `<clipPath id="text${index}"><text text-anchor="start" x="${x}" y="${y}" class="text ${line.class}">${line.text}</text></clipPath>`;
            // tslint:enable:max-line-length

            rects += rect;
            firstDraw += firstText;
            secondDraw += secondText;
            defs += clipPath;
            y += line.lineHeight;
            index++;
            firstDelay += delayDelta;
            secondDelay += delayDelta;
        }

        const svgHTML = `
            <svg class="intro go" width="100%" height="100%">
                <g style="opacity:0.7">
                    ${rects}
                </g>
                <g>
                    ${firstDraw}
                    ${secondDraw}
                </g>
                <defs>
                    ${defs}
                </defs>
            </svg>
        `;
        const details = document.getElementById("details");
        details.innerHTML = svgHTML;

        this.playDeferred = new prague.utils.Deferred<void>();
        this.player.loadVideoById({ videoId: video.id, startSeconds: video.start, endSeconds: video.end });
        this.player.playVideo();

        await this.playDeferred.promise;
    }
}

async function run(id: string, YT: any): Promise<void> {
    const revedId = `${id}${rev}`;
    const player = new VideoPlayer(YT, "player");
    const token = jwt.sign(
        {
            documentId: revedId,
            permission: "read:write",
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(revedId, { blockUpdateMarkers: true, token });
    await new Promise((resolve) => {
        collabDoc.once("connected", () => resolve());
    });

    const rootView = await collabDoc.getRoot().getView();

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        rootView.set("messages", collabDoc.createStream());
    } else {
        await rootView.wait("messages");
    }

    // Load the text string and listen for updates
    const stream = rootView.get("messages") as prague.types.IStream;

    stream.on("op", (op) => {
        const delta = op.contents as prague.types.IDelta;
        for (const operation of delta.operations) {
            if (operation.stylusDown) {
                const rawPen = operation.stylusDown.pen as any;
                if (rawPen.event === "push") {
                    const pushEvent = rawPen.hook as gh.IPushHook;
                    player.addToPlaylist(pushEvent);
                }
            }
        }
    });
}

export function load(id: string, playerFn: any) {
    run(id, playerFn).catch(
        (error) => {
            console.error(error);
        });
}
