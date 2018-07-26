import { api as prague } from "@prague/routerlicious";

import { VideoDocument } from "../documents";
import { IUser } from "../github";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

function track(video, divId: string, eventId: string, getFn: () => string, setFn: (value: string) => void) {
    const input = document.getElementById(divId) as HTMLInputElement;
    input.value = getFn();

    input.onchange = (event) => {
        setFn(input.value);
    };

    video.on(eventId, (local) => {
        const current = getFn();
        if (!local && current !== input.value) {
            input.value = current;
        }
    });
}

async function run(user: IUser): Promise<void> {
    const video = await VideoDocument.Load(user.login, tenantId, secret);

    track(video, "videoId", "videoChanged", () => video.id, (value) => video.id = value);
    track(
        video,
        "start",
        "startChanged",
        () => `${video.start}`,
        (value) => video.start = Number.parseInt(value, 10));
    track(
        video,
        "end",
        "endChanged",
        () => `${video.end}`,
        (value) => video.end = Number.parseInt(value, 10));
}

export function loadVideo(profile: IUser, playerFn: any) {
    run(profile).catch(
        (error) => {
            console.error(error);
        });
}
