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

const videoDocMap = new Map<string, Promise<VideoDocument>>();

async function playVideo(player, id: string) {
    if (!videoDocMap.has(id)) {
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
        videoDocMap.set(id, videoP);
    }

    const video = await videoDocMap.get(id);
    player.loadVideoById({ videoId: video.id, startSeconds: video.start, endSeconds: video.end });
}

async function run(id: string, YT: any): Promise<void> {
    const playerP = new Promise<any>((resolve, reject) => {
        const p = new YT.Player(
            "player",
            {
                events: {
                    onReady: () => {
                        console.log("Hey, I'm ready!");
                        resolve(p);
                    },
                    onStateChange: (event) => {
                        console.log(JSON.stringify(event, null, 2));
                    },
                },
                height: "100%",
                width: "100%",
            });
    });

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
    const player = await playerP;

    console.log("Listening inbound");
    stream.on("op", (op) => {
        const delta = op.contents as prague.types.IDelta;
        for (const operation of delta.operations) {
            if (operation.stylusDown) {
                const rawPen = operation.stylusDown.pen as any;
                if (rawPen.event === "push") {
                    const pushEvent = rawPen.hook as gh.IPushHook;
                    playbackQueue.push(pushEvent.commits[0].author.username);
                }
            }
        }
    });

    const playbackQueue = async.queue<string, any>(
        (work, callback) => {
            playVideo(player, work)
                .catch(() => { return; })
                .then(() => callback());
        },
        1);
}

export function load(id: string, playerFn: any) {
    run(id, playerFn).catch(
        (error) => {
            console.error(error);
        });
}
