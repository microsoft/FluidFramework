import { globalConfig } from "./globalConfig";
import { settingCollection } from "./pragueServerSettings";
// ------------------------
// Inputs
// ------------------------
abstract class SavedInput {
    protected input: HTMLInputElement | HTMLSelectElement;
    protected constructor(private readonly name: string, private readonly defaultValue: string | boolean) {
        this.input = document.getElementById(name) as HTMLInputElement | HTMLSelectElement;
    }

    public reset() {
        this.value = this.defaultValue;
        this.save();
    }

    public save() {
        console.log("Saved", this.name, this.value);
        const savedValue = {};
        savedValue[this.name] = this.value;
        chrome.storage.local.set(savedValue);
    }

    public abstract get value(): string | boolean;
    public abstract set value(val: string | boolean);
    protected abstract get eventName();

    protected initialize(state?: any) {
        if (state && state.enabled) {
            this.input.disabled = true;
            this.value = state[this.name];
        } else {
            chrome.storage.local.get(this.name, (items) => {
                console.log(this.name, items[this.name]);
                if (items[this.name] !== undefined) {
                    this.value = items[this.name];
                } else {
                    console.log(this.name, "default");
                    this.value = this.defaultValue;
                    this.save();
                }
            });
        }
        this.input.addEventListener(this.eventName, () => this.save());
    }
}

class SavedValueInput extends SavedInput {
    public static Create(name: string, defaultValue: string, state?: any): SavedValueInput {
        const s = new SavedValueInput(name, defaultValue);
        s.initialize(state);
        return s;
    }
    public get value(): string {
        return this.input.value;
    }
    public set value(val: string) {
        this.input.value = val;
    }
    protected get eventName() { return "input"; }

}
class SavedCheckBoxInput extends SavedInput {
    public static Create(name: string, defaultValue: boolean, state?: any): SavedCheckBoxInput {
        const s = new SavedCheckBoxInput(name, defaultValue);
        s.initialize(state);
        return s;
    }
    public get value() {
        return (this.input as HTMLInputElement).checked;
    }
    public set value(val: boolean) {
        (this.input as HTMLInputElement).checked = val;
    }
    protected get eventName() { return "click"; }
}

class SavedSelectInput extends SavedValueInput {
    public static Create(name: string, collection: any, defaultValue: string, state?: any): SavedSelectInput {
        const element = document.getElementById(name) as HTMLSelectElement;

        for (const i of Object.keys(settingCollection)) {
            const option = document.createElement("option") as HTMLOptionElement;
            option.value = i;
            option.text = i;
            element.add(option);
        }

        const s = new SavedSelectInput(name, collection, defaultValue);
        s.initialize(state);
        return s;
    }
    private constructor(name: string, private readonly collection: any, defaultValue: string) {
        super(name, defaultValue);
    }
    public get value() {
        return super.value;
    }
    public set value(val: string) {
        console.log(val);
        if (this.collection[val] !== undefined) {
            console.log(val);
            super.value = val;
        }
    }
    protected get eventName() { return "change"; }
}

function randomDocPrefix() {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    let name = "";
    arr.forEach((val) => {
        val = val % 52;
        if (val < 26) {
            name += String.fromCharCode("A".charCodeAt(0) + val);
        } else {
            name += String.fromCharCode("a".charCodeAt(0) + val - 26);
        }
    });
    return name;
}

const bgPage = chrome.extension.getBackgroundPage();
const streamState = bgPage ? (bgPage.window as any).getStreamingState() : undefined;
const docName = SavedValueInput.Create("docId", randomDocPrefix(), streamState);
const background = SavedCheckBoxInput.Create("background", true, streamState);
const batchOps = SavedCheckBoxInput.Create("batchOps", true, streamState);
const fullView = SavedCheckBoxInput.Create("fullView", false);
const debugView = SavedCheckBoxInput.Create("debugView", false);
const serverDropDown = SavedSelectInput.Create("server", settingCollection, globalConfig.defaultServer, streamState);
const autoIncrement = SavedCheckBoxInput.Create("autoIncrement", true);

// ------------------------
// Buttons
// ------------------------
function getCurrentTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length !== 0) { callback(tabs[0]); }
    });
}
function sendCommand(commandValue: string) {
    getCurrentTab((tab) => {
        chrome.runtime.sendMessage({
            background: background.value,
            batchOps: batchOps.value,
            command: commandValue,
            docId: docName.value,
            server: serverDropDown.value,
            tab,
        });
        window.close();
    });
}

const tabBtn = document.getElementById("tab_btn") as HTMLInputElement;
const jsonBtn = document.getElementById("json_btn") as HTMLInputElement;
const pragueMapBtn = document.getElementById("prague_btn") as HTMLInputElement;
const pragueFlatMapBtn = document.getElementById("prague_flat_btn") as HTMLInputElement;
const streamStartBtn = document.getElementById("prague_stream_start_btn") as HTMLInputElement;
const streamStopBtn = document.getElementById("prague_stream_stop_btn") as HTMLInputElement;
const clearBtn = document.getElementById("clear_btn") as HTMLInputElement;

// Initialize button command
tabBtn.onclick = () => sendCommand("Tab");
jsonBtn.onclick = () => sendCommand("JSON");
pragueMapBtn.onclick = () => sendCommand("PragueMap");
pragueFlatMapBtn.onclick = () => sendCommand("PragueFlatMap");
streamStartBtn.onclick = () => sendCommand("PragueStreamStart");
streamStopBtn.onclick = () => {
    sendCommand("PragueStreamStop");
    if (autoIncrement.value) {
        const currentDoc = docName.value;
        const lastIndex = currentDoc.lastIndexOf("_");
        if (lastIndex !== -1) {
            const suffix = currentDoc.substring(lastIndex + 1);
            const n = parseInt(currentDoc.substring(lastIndex + 1), 10);
            if (!isNaN(n) && n.toString() === suffix) {
                docName.value = currentDoc.substring(0, lastIndex + 1) + (n + 1).toString();
                docName.save();
                return;
            }
        }
        docName.value = currentDoc + "_0";
        docName.save();
    }
};
document.getElementById("prague_view_btn").onclick = () =>
    window.open(chrome.runtime.getURL("pragueView.html") + "?full=" + fullView.value + "&debug="
        + debugView.value + "&server=" + serverDropDown.value + "&docId=" + docName.value);

clearBtn.onclick = () => {
    docName.reset();
    background.reset();
    batchOps.reset();
    fullView.reset();
    debugView.reset();
    serverDropDown.reset();
    autoIncrement.reset();
};

if (streamState && streamState.enabled) {
    streamStartBtn.style.visibility = "hidden";

    getCurrentTab((tab) => {
        document.getElementById("status").innerHTML = (streamState.pending ? "[PENDING] " : "") +
            "Streaming in tab " + streamState.tabId + (tab.id === streamState.tabId ? " (Current)" : "");
    });
} else {
    streamStopBtn.style.visibility = "hidden";
}
