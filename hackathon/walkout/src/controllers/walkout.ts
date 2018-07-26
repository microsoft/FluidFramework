import { api as prague } from "@prague/routerlicious";
import * as async from "async";
import * as jwt from "jsonwebtoken";
import { VideoDocument } from "../documents";
import * as gh from "../github";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

class VideoPlayer {
    private player: any;
    private playbackQueue: async.AsyncQueue<string>;
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

        this.playbackQueue = async.queue<string, any>(
            (work, callback) => {
                this.playVideo(work)
                    .catch(() => { return; })
                    .then(() => callback());
            },
            1);
        this.playbackQueue.pause();
    }

    public addToPlaylist(id: string) {
        this.playbackQueue.push(id);
    }

    private async playVideo(id: string) {
        if (!this.videoDocMap.has(id)) {
            const token = jwt.sign(
                {
                    documentId: id,
                    permission: "read:write",
                    tenantId,
                    user: {
                        id: "test",
                    },
                },
                secret);
            const videoP = VideoDocument.Load(id, token);
            this.videoDocMap.set(id, videoP);
        }

        const video = await this.videoDocMap.get(id);
        this.playDeferred = new prague.utils.Deferred<void>();
        this.player.loadVideoById({ videoId: video.id, startSeconds: video.start, endSeconds: video.end });

        await this.playDeferred.promise;
    }
}

async function run(id: string, YT: any): Promise<void> {
    const player = new VideoPlayer(YT, "player");

    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write",
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });
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
                    player.addToPlaylist(pushEvent.commits[0].author.username);
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
