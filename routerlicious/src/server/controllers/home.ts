import * as $ from "jquery";
import * as api from "../../api";
import * as socketStorage from "../../socket-storage";

$(document).ready(() => {
    let provider = new socketStorage.StorageProvider();
    provider.connect({ token: "none" }).then((storage) => {
        api.load(storage, "test").then((document) => {
            console.log("loaded document test");
        });
    });
});
