import * as $ from "jquery";

export async function load(id: string) {
    $("document").ready(() => {
        $("#mapViews").append(`<p>${id}</p>`);
    });
}
