/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * This component is simple but heavily commented for clarity. Commented lines
 * are used to break up the code (though note that the actual private class and
 * public loading scopes do NOT match the lines exactly!) into chunks.
 */


/******************************************************************************/
// Import the Fluid Framework "goo":
/******************************************************************************/
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import {
    SequenceDeltaEvent,
    SharedString,
} from "@microsoft/fluid-sequence";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
/******************************************************************************/

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const TextAreaNoReactName = pkg.name as string;

/**
 * A simple interface to help manage state - in the style of React. We could do
 * without this interface and just use manual calls, but having a private
 * variable to help keep track makes the logic
 */
interface ITextareaState {
    selectionStart: number;
    selectionEnd: number;
    text: string;
}

/**
 * A simple page that contains an HTML <textarea> that
 * allow collaborative editing. Heavily based on Skyler Jokiel's React-infused
 * CollaborativeTextArea in `packages/framework/aqueductreact`.
 */
export class TextareaNoReact extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private readonly textareaState: ITextareaState = {
        selectionEnd: 0,
        selectionStart: 0,
        text: "",
    };
    private readonly textareaRootKey: string = "textareaString";
    private textareaID: string = "<unset dom ID>";

    /******************************************************************************/
    // One-time component setup:
    /******************************************************************************/
    /**
   * Initialization method that creates one SharedString collab. object and
   * registers it on this component's root map (which itself is inherited from
   * the PrimedComponent base class). This method is called only once.
   */
    protected async componentInitializingFirstTime() {
        console.log("textarea-noreact: first time call");

        this.root.set(this.textareaRootKey,
            SharedString.create(this.runtime).handle);
    }
    /******************************************************************************/


    /******************************************************************************/
    // Core app logic (in this case: fancy marker positioning and text updating):
    /******************************************************************************/

    /**
   * Helper method to force a DOM refresh of the <textarea>.
   */
    protected forceDOMUpdate(newText: string,
                             newSelectionStart?: number,
                             newSelectionEnd?: number) {
        const textareaElement =
            document.getElementById(this.textareaID) as HTMLTextAreaElement;
        textareaElement.value = newText;

        if (newSelectionStart !== undefined) {
            textareaElement.selectionStart = newSelectionStart;
        }
        if (newSelectionEnd !== undefined) {
            textareaElement.selectionEnd = newSelectionEnd;
        }
    }

    /**
   * Update the current caret selection.
   * We need to do this before we do any handleXChange action or we will have
   * lost our cursor position and not be able to accurately update the shared
   * string.
   */
    protected updateSelection() {
        // No access to React style refs, so a manual call is made to the DOM to
        // retrieve the current <textarea> (and more importantly the caret positions
        // for the current selection):
        const currentTextareaElement =
            document.getElementById(this.textareaID) as HTMLTextAreaElement;

        if (currentTextareaElement === undefined) {
            return;
        }

        const selectionEnd =
            currentTextareaElement.selectionEnd ?
                currentTextareaElement.selectionEnd : 0;
        const selectionStart =
            currentTextareaElement.selectionStart ?
                currentTextareaElement.selectionStart : 0;
        this.textareaState.selectionEnd = selectionEnd;
        this.textareaState.selectionStart = selectionStart;
    }

    /**
   * Handle any incoming SequenceDeltaEvent(s) (fired off whenever an insertion,
   * replacement, or removal is made to the primary SharedString of this
   * component).
   *
   * Note that incoming events include events made by the local user, but that
   * `event` has a flag to mark if the change is local. Much of the logic deals
   * with how to update the user's selection markers if the incoming changes
   * affect selected (highlighted) text.
   *
   * @param event Incoming delta on a SharedString
   */
    protected async handleIncomingChange(event: SequenceDeltaEvent) {
        console.log("textarea-noreact: incoming change to shared string!");

        // Initial data requests. After the space, the remainder of the code is
        // lightly edited from `collaborativeTextArea.tsx` from `aqueduct` to use
        // these sources instead of React.
        const newText =
            (await this.root.get<IComponentHandle<SharedString>>(this.textareaRootKey)
                .get())
                .getText();

        // We only need to insert if the text changed.
        if (newText === this.textareaState.text) {
            return;
        }

        // If the event is our own then just insert the text and keep the caret
        // positions the same.
        if (event.isLocal) {
            this.forceDOMUpdate(newText);
            this.textareaState.text = newText;
            return;
        }

        // Because we did not make the change we need to manage the remote
        // character insertion.
        const remoteCaretStart = event.first.position;
        const remoteCaretEnd = event.last.position + event.last.segment.cachedLength;
        const charactersModifiedCount =
            newText.length - this.textareaState.text.length;

        this.updateSelection();
        const currentCaretStart = this.textareaState.selectionStart;
        const currentCaretEnd = this.textareaState.selectionEnd;

        let newCaretStart = 0;
        let newCaretEnd = 0;

        // Remote text inserted/removed after our cp range
        if (currentCaretEnd <= remoteCaretStart) {
            // Cp stays where it was before.
            newCaretStart = currentCaretStart;
            newCaretEnd = currentCaretEnd;
        } else if (currentCaretStart > (remoteCaretEnd - 1)) {
            // Remote text inserted/removed before our cp range
            // We need to move our cp the number of characters inserted/removed
            // to ensure we are in the same positions
            newCaretStart = currentCaretStart + charactersModifiedCount;
            newCaretEnd = currentCaretEnd + charactersModifiedCount;
        } else {
            // Remote text is overlapping cp

            // The remote changes occurred inside current selection
            if (remoteCaretEnd <= currentCaretEnd &&
                remoteCaretStart > currentCaretStart) {
                // Our selection needs to include remote changes
                newCaretStart = currentCaretStart;
                newCaretEnd = currentCaretEnd + charactersModifiedCount;
            } else if (remoteCaretEnd >= currentCaretEnd &&
                remoteCaretStart <= currentCaretStart) {
                // The remote changes encompass our location

                // Our selection has been removed
                // Move our cp to the beginning of the new text insertion
                newCaretStart = remoteCaretStart;
                newCaretEnd = remoteCaretStart;
            } else {
                // We have partial overlapping selection with the changes.
                // This makes things a lot harder to manage so for now we will just
                // remove the current selection
                // and place it to the remote caret start.
                // TODO: implement this the correct way
                newCaretStart = remoteCaretStart;
                newCaretEnd = remoteCaretStart;
            }
        }

        this.textareaState.text = newText;
        this.textareaState.selectionEnd = newCaretEnd;
        this.textareaState.selectionStart = newCaretStart;

        this.forceDOMUpdate(newText, newCaretStart, newCaretEnd);
    }

    /**
   * Send a change to the SharedString when an event is detected on the
   * <textarea>.
   *
   * No further changes are made to the <textarea> itself, but the current
   * positions of the user's selection markers/carets are used to determine
   * whether a insertion, replacement, or removal call is necessary for the
   * SharedString.
   *
   * @param ev An outgoing Event on the titular <textarea>
   */
    protected async handleOutgoingChange(ev: Event) {
        console.log("textarea-noreact: outgoing change to shared string!");

        // Initial data requests. After the space, the remainder of the code is
        // lightly edited from `collaborativeTextArea.tsx` from `aqueduct` to use
        // these sources instead of React.
        const evctAsHTML = (ev.currentTarget as HTMLTextAreaElement);
        const textareaString =
            await this.root.get<IComponentHandle<SharedString>>(this.textareaRootKey)
                .get();

        // We need to set the value here to keep the input responsive to the user
        const newText = evctAsHTML.value;
        const charactersModifiedCount =
            this.textareaState.text.length - newText.length;

        // Get the new caret position and use that to get the text that was inserted
        const newPosition = evctAsHTML.selectionStart
            ? evctAsHTML.selectionStart : 0;
        const isTextInserted = newPosition - this.textareaState.selectionStart > 0;
        if (isTextInserted) {
            const insertedText =
                newText.substring(this.textareaState.selectionStart, newPosition);
            const changeRangeLength =
                this.textareaState.selectionEnd - this.textareaState.selectionStart;
            if (changeRangeLength === 0) {
                textareaString.insertText(this.textareaState.selectionStart,
                    insertedText);
            } else {
                textareaString.replaceText(this.textareaState.selectionStart,
                    this.textareaState.selectionEnd,
                    insertedText);
            }
        } else {
            textareaString.removeText(newPosition,
                newPosition + charactersModifiedCount);
        }
    }
    /******************************************************************************/


    /******************************************************************************/
    // HTML setup and rendering:
    /******************************************************************************/

    /**
   * Render the component page and setup necessary hooks.
   *
   * This method is called any time the page is opened/refreshed - the goal is
   * to add any handlers, etc. that might be necessary for the component to
   * function properly after such an event.
   */
    public async render(div: HTMLElement) {
        console.log("textarea-noreact: render call");

        // Change to whatever:
        this.textareaID = "textareaElement";

        // Bind the `this` referring to the class instance for each of these private
        // methods. Without doing so, you cannot guarantee that usage of `this`
        // inside of the private methods will work correctly - most notably,
        // `this.root` may end up undefined because the root map only exists on the
        // class instance.
        this.handleIncomingChange = this.handleIncomingChange.bind(this);
        this.handleOutgoingChange = this.handleOutgoingChange.bind(this);
        this.createComponentDom = this.createComponentDom.bind(this);
        this.updateSelection = this.updateSelection.bind(this);
        this.forceDOMUpdate = this.forceDOMUpdate.bind(this);

        // Add handler for incoming (from other component views) SharedString
        // changes. The handler is added here because any (re)rendered component
        // view needs to "know" when to update its own instance of the <textarea>
        // (which is what this handler will take care of). You could not add this,
        // say, in the `componentInitializingFirstTime` method because that is only
        // called once - it is not called for every view, so there would be no way
        // to inform another client to update on a new change.
        const textareaString =
            await this.root.get<IComponentHandle<SharedString>>(this.textareaRootKey)
                .get();

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        textareaString.on("sequenceDelta", this.handleIncomingChange);
        this.textareaState.text = textareaString.getText();
        console.log(`textarea-noreact: ${this.textareaState.text}`);

        // Do the actual HTML page setup off the given div:
        this.createComponentDom(div);
    }

    /**
   * Set up the HTML elements inside the provided host HTML element (usually a
   * div).
   */
    protected createComponentDom(host: HTMLElement) {
        const textareaElement: HTMLTextAreaElement =
            document.createElement("textarea");
        textareaElement.id = this.textareaID;
        textareaElement.style.width = "300px";
        textareaElement.style.height = "150px";

        textareaElement.value = this.textareaState.text;

        textareaElement.oninput = this.handleOutgoingChange;

        textareaElement.selectionStart = this.textareaState.selectionStart;
        textareaElement.selectionEnd = this.textareaState.selectionEnd;

        textareaElement.onclick = this.updateSelection;
        textareaElement.onkeydown = this.updateSelection;

        host.appendChild(textareaElement);
    }
    /******************************************************************************/
} // end class

/**
 * Register the necessary DDS types for this component. This method is how the
 * component runtime knows what external DDS/component information is necessary
 * to package up before the component itself is created. Hence the seemingly
 * double named term "instantiation factory".
 *
 * In the case of this component, we only rely on two DDS types (and no external
 * components): a SharedMap (for the root map), and two SharedString types (but
 * we do NOT need to list this twice - we only merely need to "mention" that it
 * exists once).
 *
 * As of 0.9, the root map of a PrimedComponent (which we extend) is designated
 * a special DDS type: the SharedDirectory (reflected below).
 *
 * Primarily boilerplate code.
 */
export const TextareaNoReactInstantiationFactory =
    new PrimedComponentFactory(
        TextAreaNoReactName,
        TextareaNoReact,
        [
            SharedString.getFactory(),
        ],
        {},
        {},
    );
/******************************************************************************/
