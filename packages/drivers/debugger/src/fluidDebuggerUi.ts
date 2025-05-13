/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IVersion,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

/**
 * @internal
 */
export interface IDebuggerUI {
	/**
	 * Version information is provided.
	 * Expect updates (information about seq#, timestamp) through updateVersion() calls
	 */
	addVersions(version: IVersion[]): void;

	/**
	 * Call when new version is downloaded from storage
	 * Expect multiple callbacks.
	 */
	updateVersion(index: number, version: IVersion, seqNumber: number): void;

	/**
	 * Called in response to successful onVersionSelection() or onSnapshotFileSelection() call
	 * and provides extra information about selection.
	 * It expected that UI layer would change its mode as result of this call, i.e. switch to
	 * displaying op playback controls (if this is supported)
	 * Note: There maybe no call to versionSelected() in response to onSnapshotFileSelection() call
	 * if file does not exist, has wrong name of wrong format.
	 * @param version - version, file name, or undefined if playing ops.
	 */
	versionSelected(seqNumber: number, version: IVersion | string): void;

	/**
	 * Called by controller in response to new ops being downloaded
	 * Called with disable = true if there are no (currently) ops to play
	 */
	disableNextOpButton(disable: boolean): void;

	/**
	 * Called by controller when new ops arrive (or we are done playing previous batch)
	 * Indicates next batch of ops that would be played when UI calls controller's onOpButtonClick()
	 * Called with ops=[] when there are no ops to play.
	 */
	updateNextOpText(ops: ISequencedDocumentMessage[]): void;

	/**
	 * Called periodically when new versions are downloaded from server
	 */
	updateVersionText(versionsLeft: number): void;

	/**
	 * Called periodically to notify about last known op
	 * @param lastKnownOp - seq number of last known op. -1 if can't play ops in this mode (load from file)
	 * @param stillLoading - true if we did not reach yet the end of the stream
	 */
	updateLastOpText(lastKnownOp: number, stillLoading: boolean): void;
}

/**
 * @internal
 */
export interface IDebuggerController {
	/**
	 * Initialization. UI layers calls into controller to connect the two.
	 * @param ui - UI layer
	 */
	connectToUi(ui: IDebuggerUI);

	/**
	 * Called by UI layer when debugger window is closed by user
	 * If called before user makes selection of snapshot/file, original
	 * document service is returned to loader (instead of debugger service) and normal document load continues.
	 */
	onClose(): void;

	/**
	 * UI Layer notifies about selection of version to continue.
	 * On successful load, versionSelected() is called.
	 * @param version - Snapshot version to start from.
	 */
	onVersionSelection(version: IVersion): void;

	/**
	 * UI Layer notifies about selection of version to continue.
	 * On successful load, versionSelected() is called.
	 * @param version - File to load snapshot from
	 */
	onSnapshotFileSelection(file: File): void;

	/**
	 * "next op" button is clicked in the UI
	 * @param steps - number of ops to play.
	 */
	onOpButtonClick(steps: number): void;

	/**
	 * "Download ops" option is clicked in the UI. Returns JSON of the full opStream when available.
	 * @param anonymize - anonymize the ops json using the sanitization tool
	 */
	onDownloadOpsButtonClick(anonymize: boolean): Promise<string>;
}

const debuggerWindowHtml = `<Title>Fluid Debugger</Title>
<body>
<h3>Fluid Debugger</h3>
Please select snapshot or file to start with<br/>
Close debugger window to proceed to live document<br/><br/>
<select style='width:250px' id='selector'>
</select>
&nbsp; &nbsp; &nbsp;
<button id='buttonVers' style='width:60px'>Go</button><br/>
<input id='file' type='file' value='Load from file'/>
<br/><br/>
<h4>Download the current document's ops</h4>
<input type='checkbox' id='anonymize' value='Anonymize'>
<label for='anonymize'>Anonymize</label>
<button type='button' id='downloadOps'>Download ops</button>
<br/><br/><div id='versionText'></div>
</body>`;

const debuggerWindowHtml2 = `<Title>Fluid Debugger</Title>
<body>
<h3>Fluid Debugger</h3>
<div id='versionText'></div>
<div id='lastOp'></div>
<br/>
Step to move: <input type='number' id='steps' value='1' min='1' style='width:50px'/>
&nbsp; &nbsp; &nbsp;<button id='buttonOps' style='width:60px'>Go</button>
<br/><br/>
<div id='text1'></div><div id='text2'></div><div id='text3'></div>
<br/>
<h4>Download the current document's ops</h4>
<input type='checkbox' id='anonymize' value='Anonymize'>
<label for='anonymize'>Anonymize</label>
<button type='button' id='downloadOps'>Download ops</button>
</body>`;

/**
 * @internal
 */
export class DebuggerUI {
	public static create(controller: IDebuggerController): DebuggerUI | null {
		if (
			typeof window !== "object" ||
			window === null ||
			typeof window.document !== "object" ||
			window.document == null
		) {
			console.log("Can't create debugger window - not running in browser!");
			return null;
		}

		const debuggerWindow = window.open(
			"",
			"",
			"width=400,height=400,resizable=yes,location=no,menubar=no,titlebar=no,status=no,toolbar=no",
		);
		if (!debuggerWindow) {
			console.error(
				"Can't create debugger window - please enable pop-up windows in your browser!",
			);
			return null;
		}

		return new DebuggerUI(controller, debuggerWindow);
	}

	private static formatDate(date: number) {
		// Alternative - without timezone
		// new Date().toLocaleString('default', { timeZone: 'UTC'}));
		// new Date().toLocaleString('default', { year: 'numeric', month: 'short',
		//      day: 'numeric', hour: '2-digit', minute: 'numeric', second: 'numeric' }));
		return new Date(date).toUTCString();
	}

	protected selector?: HTMLSelectElement;
	protected versionText: HTMLDivElement;

	protected buttonOps?: HTMLButtonElement;
	protected text1?: HTMLDivElement;
	protected text2?: HTMLDivElement;
	protected text3?: HTMLDivElement;
	protected lastOpText?: HTMLDivElement;
	protected wasVersionSelected = false;
	protected versions: IVersion[] = [];

	protected documentClosed = false;

	protected constructor(
		private readonly controller: IDebuggerController,
		private readonly debuggerWindow: Window,
	) {
		const doc = this.debuggerWindow.document;
		doc.write(debuggerWindowHtml);

		window.addEventListener(
			"beforeunload",
			(e) => {
				this.documentClosed = true;
				this.debuggerWindow.close();
			},
			false,
		);

		this.debuggerWindow.addEventListener(
			"beforeunload",
			(e) => {
				if (!this.documentClosed) {
					this.controller.onClose();
				}
			},
			false,
		);

		this.selector = doc.getElementById("selector") as HTMLSelectElement;

		const buttonVers = doc.getElementById("buttonVers") as HTMLDivElement;
		buttonVers.onclick = () => {
			const index = this.selector!.selectedIndex;
			// TODO Why are we non null asserting here
			controller.onVersionSelection(this.versions[index]!);
		};

		const fileSnapshot = doc.getElementById("file") as HTMLInputElement;
		fileSnapshot.addEventListener(
			"change",
			() => {
				const files = fileSnapshot.files;
				if (files) {
					// TODO Why are we non null asserting here
					controller.onSnapshotFileSelection(files[0]!);
				}
			},
			false,
		);

		const opDownloadButton = doc.getElementById("downloadOps") as HTMLElement;
		const anonymizeCheckbox = doc.getElementById("anonymize") as HTMLInputElement;
		this.attachDownloadOpsListener(opDownloadButton, anonymizeCheckbox);

		this.versionText = doc.getElementById("versionText") as HTMLDivElement;
		this.versionText.textContent = "Fetching snapshots, please wait...";

		controller.connectToUi(this);
	}

	private attachDownloadOpsListener(element: HTMLElement, anonymize: HTMLInputElement) {
		element.addEventListener("click", () => {
			this.controller
				.onDownloadOpsButtonClick(anonymize.checked)
				.then((opJson) => {
					this.download("opStream.json", opJson);
				})
				.catch((error) => {
					console.log(`Error downloading ops: ${error}`);
				});
		});
	}

	public addVersions(versions: IVersion[]) {
		if (this.selector) {
			this.versions = versions;
			for (const version of versions) {
				const option = document.createElement("option");
				option.text =
					version.date !== undefined
						? `id = ${version.id},  time = ${version.date}`
						: `id = ${version.id}`;
				this.selector.add(option);
			}
		}
	}

	public updateVersion(index: number, version: IVersion, seqNumber: number) {
		if (this.selector) {
			const option = this.selector[index] as HTMLOptionElement;
			option.text = `${option.text},  seq = ${seqNumber}`;
			this.selector[index] = option;
		}
	}

	public versionSelected(seqNumber: number, version: IVersion | string) {
		const text =
			typeof version === "string"
				? `Playing ${version} file`
				: `Playing from ${version.id}, seq# ${seqNumber}`;

		this.wasVersionSelected = true;
		this.selector = undefined;

		const doc = this.debuggerWindow.document;
		doc.open();
		doc.write(debuggerWindowHtml2);
		doc.close();

		this.lastOpText = doc.getElementById("lastOp") as HTMLDivElement;
		this.text1 = doc.getElementById("text1") as HTMLDivElement;
		this.text2 = doc.getElementById("text2") as HTMLDivElement;
		this.text3 = doc.getElementById("text3") as HTMLDivElement;

		const steps = doc.getElementById("steps") as HTMLInputElement;
		this.buttonOps = doc.getElementById("buttonOps") as HTMLButtonElement;
		this.buttonOps.disabled = true;
		this.buttonOps.onclick = () => {
			this.controller.onOpButtonClick(Number(steps.value));
		};

		this.versionText = doc.getElementById("versionText") as HTMLDivElement;
		this.versionText.textContent = text;

		const opDownloadButton = doc.getElementById("downloadOps") as HTMLElement;
		const anonymizeCheckbox = doc.getElementById("anonymize") as HTMLInputElement;
		this.attachDownloadOpsListener(opDownloadButton, anonymizeCheckbox);
	}

	public disableNextOpButton(disable: boolean) {
		assert(!!this.buttonOps, 0x088 /* "Missing button ops button!" */);
		this.buttonOps.disabled = disable;
	}

	public updateNextOpText(ops: ISequencedDocumentMessage[]) {
		if (ops.length === 0) {
			this.text1!.textContent = "";
			this.text2!.textContent = "";
			this.text3!.textContent = "";
		} else {
			// Non null asserting here because of the length check above
			const op = ops[0]!;
			const seq = op.sequenceNumber;
			const date = DebuggerUI.formatDate(op.timestamp);
			this.text1!.textContent = `Next op seq#: ${seq}`;
			this.text2!.textContent = `Type: ${op.type}`;
			this.text3!.textContent = `${date}`;
		}
	}

	public updateVersionText(versionCount: number) {
		if (!this.wasVersionSelected) {
			const text =
				versionCount === 0 ? "" : `Fetching information about ${versionCount} snapshots...`;
			this.versionText.textContent = text;
		}
	}

	public updateLastOpText(lastKnownOp: number, stillLoading: boolean) {
		const text = stillLoading
			? `Last op (still loading): ${lastKnownOp}`
			: `Document's last op seq#: ${lastKnownOp}`;
		this.lastOpText!.textContent = text;
	}

	private download(filename: string, data: string): void {
		const element = document.createElement("a");
		element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(data)}`);
		element.setAttribute("download", filename);

		element.style.display = "none";
		document.body.appendChild(element);

		element.click();

		document.body.removeChild(element);
	}
}
