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
  SimpleComponentInstantiationFactory,
} from "@prague/aqueduct";
import {
  IComponentHTMLVisual,
} from "@prague/container-definitions";
  import {
    SharedMap,
  } from "@prague/map";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import {
  SharedString, SequenceDeltaEvent
} from "@prague/sequence";
/******************************************************************************/

/**
 * A simple interface to help manage state - in the style of React. We could do
 * without this interface and just use manual calls, but having a private
 * variable to help keep track makes the logic
 */
interface ITextAreaState {
  selectionStart: number;
  selectionEnd: number;
  text: string;
}

/**
 * A simple page that contains an HTML <textarea> that
 * allow collaborative editing. Heavily based on Skyler Jokiel's React-infused
 * CollaborativeTextArea in `packages/framework/aqueductreact`.
 */
export class CollaborativeTextAreaNoReact 
             extends PrimedComponent implements IComponentHTMLVisual {
  private static readonly supportedInterfaces = 
    ["IComponentHTMLVisual", "IComponentHTMLRender"];



private textAreaState: ITextAreaState;

constructor(runtime: IComponentRuntime, 
            context: IComponentContext, 
            supportedInterfaces: string[]) {
  super(runtime, context, supportedInterfaces);

  const textAreaState: ITextAreaState = {
    selectionStart: 0,
    selectionEnd: 0,
    text: ""
  }

  this.textAreaState = textAreaState;
}



/******************************************************************************/
// One-time component setup:
/******************************************************************************/
  /**
   * Initialization method that creates two SharedString collab. objects and
   * registers them on this component's root map (which itself is inherited from
   * the PrimedComponent base class). This method is called only once.
   * 
   * The legendary Sam Broner notes: we can only use distributed data types that 
   * have been registered in the exported component instantiation factory.
   */
  protected async create() {
    // Calling super.create() creates a root SharedMap.
    await super.create();

    this.root.set("textAreaString", SharedString.create(this.runtime));
  }
/******************************************************************************/


/******************************************************************************/
// Core app logic (in this case: fancy marker positioning and text updating):
/******************************************************************************/

  /**
   * Helper method to force a DOM refresh of the <textarea>.
   */
  private forceDOMUpdate(newText: string, 
                         newSelectionStart?: number, 
                         newSelectionEnd?: number) {
    const textAreaElement = 
      document.getElementById("textAreaElement") as HTMLTextAreaElement;
    textAreaElement.value = newText;
 
  }

  /**
   * Update the current caret selection.
   * We need to do this before we do any handleXChange action or we will have 
   * lost our cursor position and not be able to accurately update the shared 
   * string.
   */
  private updateSelection() {
    /**
     * No access to React style refs, so a manual call is made to the DOM to
     * retrieve the current <textarea> (and more importantly the caret positions
     * for the current selection):
     */
    const currentTextAreaElement = 
      document.getElementById("textAreaElement") as HTMLTextAreaElement;

    if (!currentTextAreaElement) {
        return;
    }

    const selectionEnd = 
      currentTextAreaElement.selectionEnd ? 
      currentTextAreaElement.selectionEnd : 0;
    const selectionStart = 
      currentTextAreaElement.selectionStart ? 
      currentTextAreaElement.selectionStart : 0;
    this.textAreaState.selectionEnd = selectionEnd;
    this.textAreaState.selectionStart = selectionStart;
  }

  private handleIncomingChange(event: SequenceDeltaEvent) {
    console.log("incoming delta change!");
    console.log(event);

    /**
     * Initial data requests. After the space, the remainder of the code is
     * lightly edited from `collaborativeTextArea.tsx` from `aqueduct` to use
     * these sources instead of React.
     */
    const newText = this.root.get<SharedString>("textAreaString").getText();

    // We only need to insert if the text changed.
    if (newText === this.textAreaState.text) {

      console.log(this.textAreaState.text);

      this.forceDOMUpdate(newText);
        return;
    }

    // If the event is our own then just insert the text and keep the caret
    // positions the same.
    if (event.isLocal) {

      console.log(this.textAreaState.text);

      this.forceDOMUpdate(newText);
        this.textAreaState.text = newText;
        return;
    }

    // Because we did not make the change we need to manage the remote
    // character insertion.
    const remoteCaretStart = event.start;
    const remoteCaretEnd = event.end;
    const charactersModifiedCount = newText.length - this.textAreaState.text.length;

    this.updateSelection();
    const currentCaretStart = this.textAreaState.selectionStart;
    const currentCaretEnd = this.textAreaState.selectionEnd;

    let newCaretStart = 0;
    let newCaretEnd = 0;

    // Remote text inserted/removed after our cp range
    if (currentCaretEnd <= remoteCaretStart) {
        // cp stays where it was before.
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
        if (remoteCaretEnd <= currentCaretEnd && remoteCaretStart > currentCaretStart) {
            // Our selection needs to include remote changes
            newCaretStart = currentCaretStart;
            newCaretEnd = currentCaretEnd + charactersModifiedCount;
        } else if (remoteCaretEnd >= currentCaretEnd && remoteCaretStart <= currentCaretStart) {
            // The remote changes encompass our location

            // Our selection has been removed
            // Move our cp to the beginning of the new text insertion
            newCaretStart = remoteCaretStart;
            newCaretEnd = remoteCaretStart;
        } else {
            // We have partial overlapping selection with the changes.
            // This makes things a lot harder to manage so for now we will just remove the current selection
            // and place it to the remote caret start.
            // TODO: implement this the correct way
            newCaretStart = remoteCaretStart;
            newCaretEnd = remoteCaretStart;
        }
    }

    this.textAreaState.text = newText;
    this.textAreaState.selectionEnd = newCaretEnd;
    this.textAreaState.selectionStart = newCaretStart;

    console.log(this.textAreaState.text);

    this.forceDOMUpdate(newText, newCaretStart, newCaretEnd);
  }

  /**
   * TODO: Implicit assumption that this is an event from <textarea>. Place
   * some sort of `assert` or guard(s)?
   */
  private handleOutgoingChange(ev: Event) {
    console.log("outgoing change to shared string!");

    /**
     * Initial data requests. After the space, the remainder of the code is
     * lightly edited from `collaborativeTextArea.tsx` from `aqueduct` to use
     * these sources instead of React.
     */
    const evctAsHTML = (ev.currentTarget as HTMLTextAreaElement);
    const textAreaString = this.root.get<SharedString>("textAreaString");
    console.log(evctAsHTML.selectionStart);

    // We need to set the value here to keep the input responsive to the user
    const newText = evctAsHTML.value;
    const charactersModifiedCount = this.textAreaState.text.length - newText.length;
    this.textAreaState.text = newText;

    // Get the new caret position and use that to get the text that was inserted
    const newPosition = evctAsHTML.selectionStart ? evctAsHTML.selectionStart : 0;
    const isTextInserted = newPosition - this.textAreaState.selectionStart > 0;
    if (isTextInserted) {
        const insertedText = newText.substring(this.textAreaState.selectionStart, newPosition);
        const changeRangeLength = this.textAreaState.selectionEnd - this.textAreaState.selectionStart;
        if (changeRangeLength === 0) {
            textAreaString.insertText(insertedText, this.textAreaState.selectionStart);
        } else {
            textAreaString.replaceText(this.textAreaState.selectionStart, this.textAreaState.selectionEnd, insertedText);
        }
    } else {
        // Text was removed
        textAreaString.removeText(newPosition, newPosition + charactersModifiedCount);
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
  public render(div: HTMLElement) {
    console.log("render occurred");

    /**
     * Bind the `this` referring to the class instance for each of these private
     * methods. Without doing so, you cannot guarantee that usage of `this`
     * inside of the private methods will work correctly - most notably,
     * `this.root` may end up undefined because the root map only exists on the
     * class instance.
     */
    this.handleIncomingChange = this.handleIncomingChange.bind(this);
    this.handleOutgoingChange = this.handleOutgoingChange.bind(this);
    this.createComponentDom = this.createComponentDom.bind(this);
    this.updateSelection = this.updateSelection.bind(this);
    this.forceDOMUpdate = this.forceDOMUpdate.bind(this);

    /**
     * Add handler for incoming (from other component views) SharedString
     * changes. The handler is added here because any (re)rendered component
     * view needs to "know" when to update its own instance of the <textArea>
     * (which is what this handler will take care of). You could not add this,
     * say, in the `create` method because that is only called once - it is
     * not called for every view, so there would be no way to inform another
     * client to update on a new change.
     */
    const textAreaString = this.root.get<SharedString>("textAreaString");
    textAreaString.on("sequenceDelta", this.handleIncomingChange);

    // Do the actual HTML page setup off the given div:
    this.createComponentDom(div);
  }

  /**
   * Set up the HTML elements inside the provided host HTML element (usually a 
   * div).
   */
  private createComponentDom(host: HTMLElement) {
    const textAreaElement: HTMLTextAreaElement = 
      document.createElement("textarea");
    textAreaElement.id = "textAreaElement";
    textAreaElement.oninput = this.handleOutgoingChange;
    textAreaElement.style.width = "300px";
    textAreaElement.style.height = "150px";

    textAreaElement.value = this.textAreaState.text;
    textAreaElement.selectionStart = this.textAreaState.selectionStart;
    textAreaElement.selectionEnd = this.textAreaState.selectionEnd;

    host.appendChild(textAreaElement);
  }
/******************************************************************************/


/******************************************************************************/
// Component loading and export:
/******************************************************************************/

  /**
   * Final (static!) load function that allows the runtime to make async calls 
   * while creating the object.
   * 
   * Primarily boilerplate code.
   */
  public static async load(runtime: IComponentRuntime, 
                           context: IComponentContext): 
    Promise<CollaborativeTextAreaNoReact> {
    const fluidComponent = 
      new CollaborativeTextAreaNoReact(
        runtime, 
        context, 
        CollaborativeTextAreaNoReact.supportedInterfaces);
    await fluidComponent.initialize();

    return fluidComponent;
  }
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
 * Primarily boilerplate code.
 */
export const CollaborativeTextAreaNoReactInstantiationFactory = 
  new SimpleComponentInstantiationFactory(
  [
    SharedMap.getFactory(),
    SharedString.getFactory(),
  ],
  CollaborativeTextAreaNoReact.load,
);
/******************************************************************************/
