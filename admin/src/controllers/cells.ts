import * as $ from "jquery";

export async function load(id: string) {
    $("document").ready(() => {
        $("#cellViews").append(`<p>${id}</p>`);
    });
}
