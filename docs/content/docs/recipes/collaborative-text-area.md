---
title: Building a Collaborative Text Area
menuPosition: 4
author: scottn12
---

In this tutorial, you'll learn how to use the `SharedString` distributed data structure (DDS) with [React](https://reactjs.org/) to create a collaborative text area. To learn more about `SharedString`, click [here](https://fluidframework.com/docs/data-structures/string/).

To jump ahead into the finished demo, check out the [SharedString example in our FluidExamples repo](TODO_URL_HERE).

The following image shows a textarea open in four browsers. The same text is in all four.

TODO: Add image

The following image shows the same four clients after an edit was made in one of the browsers. Note that the text has updated in all four browsers.

TODO: Add image

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [QuickStart]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project; e.g., `c:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed Node.js.)

    ```dotnetcli
    npx create-react-app collaborative-text-area-tutorial --use-npm
    ```

1. The project is created in a subfolder named `collaborative-text-area-tutorial`. Navigate to it with the command `cd fluid-react-tutorial`.
1. The project uses two Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Contains the SharedMap [distributed data structure]({{< relref "dds.md" >}}) that synchronizes data across clients. *This object will hold the most recent timestamp update made by any client.*|
    | `@fluidframework/tinylicious-client`   |Defines the connection to a Fluid service server and defines the starting schema for the [Fluid container][].|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/tinylicious-client fluid-framework
    ```

## Code the project

1. Open the file `\src\App.js` in your code editor. Delete all the default `import` statements except the one that imports `App.css`. Then delete all the markup from the `return` statement. The file should look like the following:

    ```js
    import "./App.css";

    function App() {
      return (

      );
    }

    export default App;
    ```

1. Add the following `import` statements. Note: `CollaborativeTextArea` and `SharedStringHelper` will be defined later.

    ```js
    import React from "react";
    import { TinyliciousClient } from "@fluidframework/tinylicious-client";
    import { SharedString } from "fluid-framework";
    import { CollaborativeTextArea } from "./CollaborativeTextArea";
    import { SharedStringHelper } from "./SharedStringHelper";
    ```

### Get Fluid Data

1. The Fluid runtime will bring changes made to the text from any client to the current client, but Fluid is agnostic about the UI framework. You can use a React hook to get the Fluid data from the SharedString object into the view layer (the React state). Add the following code below the `import` statements. This method is called when the application loads the first time, and the returned value is assigned to a React state property.

    ```js
    const useSharedString = () => {

      const [sharedString, setSharedString] = React.useState();
      const getFluidData = async () => {
        // TODO 1: Configure the container.
        // TODO 2: Get the container from the Fluid service.
        // TODO 3: Return the Fluid SharedString object.
      }

      // TODO 4: Get the Fluid Data data on app startup and store in the state
      // TODO 5: Return the SharedString Object
    }
    ```

1. Replace `TODO 1` with the following code.
    ```js
      const client = new TinyliciousClient();
      const containerSchema = {
        initialObjects: { sharedString: SharedString }
      }
    ```

1. Replace `TODO 2` with the following code. Note that `containerId` is being stored on the URL hash, and if there is no `containerId` a new container is created instead.

    ```js
    let container;
    const containerId = window.location.hash.substring(1);
    if (!containerId) {
      container = (await client.createContainer(containerSchema)).container;
      const id = await container.attach();
      window.location.hash = id;
    } else {
      container = (await client.getContainer(containerId, containerSchema)).container;
    }
    ```

1. Replace `TODO 3` with the following code.

    ```js
    return container.initialObjects.sharedString;
    ```

1. Replace `TODO 4` with the following code. Note about this code:
    - By setting an empty dependency array at the end of the `useEffect`, it is ensured that this function only gets called once.
    - Since `setFluidSharedObjects` is a state-changing method, it will cause the React `App` component to immediately rerender.

    ```js
    React.useEffect(() => {
      getFluidData()
        .then(data => setSharedString(data));
    }, []);
    ```

1. Finally, replace `TODO 5` with the following code.

    ```js
    return sharedString;
    ```

### Move the Fluid Data to the view

Inside the `App()` function, add the following code. Note about this code:
- The `sharedString` object returned from the code above is used to create a `SharedStringHelper` object, which is a class that provides simple APIs to interact with the `sharedString` object.
- Next, the `SharedStringHelper` object is passed into the `CollaborativeTextArea` React component, which integrates `SharedString` with the default `textarea` HTML element to allow co-editing through Fluid.

```js
const sharedString = useSharedString();

if (sharedString) {
  return (
    <div className="app">
      <CollaborativeTextArea sharedStringHelper={new SharedStringHelper(sharedString)} />
    </div>
  );
} else {
  return <div />;
}
```

### Setup the SharedStringHelper Class

As previously mentioned, the `SharedStringHelper` class provides simple APIs to make interactions with the `SharedString` object easier by handling the merge logic. To implement this class, follow the below instructions.

1. Create a new file `SharedStringHelper.js` inside of the `\src` directory.
1. Add the following `import` statements and declare the `SharedStringHelper` class:

    ```js
    import { TypedEventEmitter } from "@fluidframework/common-utils";
    import { MergeTreeDeltaType } from "@fluidframework/merge-tree";

    export class SharedStringHelper extends TypedEventEmitter {
      // TODO 1: Setup the class properties and constructor
      // TODO 2: Add functions for get, insert, remove, and replace text
      // TODO 3: Define sequenceDeltaHandler function
    }
    ```
1. Replace `TODO 1` with the following code. Note about this code:
    - The `SharedString` object from `App.js` is passed in.
    - `_latestText` is set to the most recent value from `_sharedString`.
    - The `this.sequenceDeltaHandler` function will be defined later. It will handle changes to the data of `_sharedString`.

    ```js
    _sharedString;
    _latestText;
    constructor(sharedString) {
      super();
      this._sharedString = sharedString;
      this._latestText = this._sharedString.getText();
      this._sharedString.on("sequenceDelta", this.sequenceDeltaHandler);
    }
    ```

1. Replace `TODO 2` with the following code.
    ```js
    getText() {
      return this._latestText;
    }
    insertText(text, pos) {
      this._sharedString.insertText(pos, text);
    }
    removeText(start, end) {
      this._sharedString.removeText(start, end);
    }
    replaceText(text, start, end) {
      this._sharedString.replaceText(start, end, text);
    }
    ```

1. Replace `TODO 3` with the following code. Note about this code.
    - This function handles changes made to the `_sharedString` object.
    - `transformPosition` is a function which will give the new position of the caret given the oldPosition. This function must be defined based on the value of `op.type`.

    ```js
    sequenceDeltaHandler = (event) => {
      this._latestText = this._sharedString.getText();
      const isLocal = event.isLocal;

      const op = event.opArgs.op;
      let transformPosition;
      if (op.type === MergeTreeDeltaType.INSERT) {
        // TODO 3A: Define transformPosition for an INSERT operation
      } else if (op.type === MergeTreeDeltaType.REMOVE) {
        // TODO 3B: Define transformPosition for a REMOVE operation
      } else {
        throw new Error("Don't know how to handle op types beyond insert and remove");
      }

      this.emit("textChanged", { isLocal, transformPosition });
    };
    ```

    Replace `TODO 3A` with the following code to handle an `INSERT` operation.

    ```js
    transformPosition = (oldPosition) => {
      if (op.pos1 === undefined) {
        throw new Error("pos1 undefined");
      }
      if (op.seg === undefined) {
        throw new Error("seg undefined");
      }
      const changeStartPosition = op.pos1;
      const changeLength = (op.seg).length;
      let newPosition;
      if (oldPosition <= changeStartPosition) {
        // Position is unmoved by the insertion if it is before the insertion's start
        newPosition = oldPosition;
      } else {
        // Position is moved by the length of the insertion if it is after the insertion's start
        newPosition = oldPosition + changeLength;
      }
      return newPosition;
    };
    ```

    Replace `TODO 3B` with the following code to handle a `REMOVE` operation.

    ```js
    transformPosition = (oldPosition) => {
      if (op.pos1 === undefined) {
        throw new Error("pos1 undefined");
      }
      if (op.pos2 === undefined) {
        throw new Error("pos2 undefined");
      }
      const changeStartPosition = op.pos1;
      const changeEndPosition = op.pos2;
      const changeLength = changeEndPosition - changeStartPosition;
      let newPosition;
      if (oldPosition <= changeStartPosition) {
        // Position is unmoved by the deletion if it is before the deletion's start
        newPosition = oldPosition;
      } else if (oldPosition > (changeEndPosition - 1)) {
        // Position is moved by the size of the deletion if it is after the deletion's end
        newPosition = oldPosition - changeLength;
      } else {
        // Position snaps to the left side of the deletion if it is inside the deletion.
        newPosition = changeStartPosition;
      }
      return newPosition;
    };
    ```


### Create CollaborativeTextArea component

`CollaborativeTextArea` is a React component which uses a `SharedStringHelper` object to control the text of a HTML `textarea` element. Follow the below steps to create this component.

1. Create a new file `CollaborativeTextArea.js` inside of the `\src` directory.
1. Add the following import statements and declare the `CollaborativeTextArea` component:

    ```js
    import React from "react";

    export const CollaborativeTextArea = (props) => {
      // TODO 1: Setup React state and references
      // TODO 2: Handle a change event in the textarea
      // TODO 3: Set the selection in textarea element (update the UI)
      // TODO 4: Store current selection from the textarea element in the React ref
      // TODO 5: Detect changes in sharedStringHelper and update React/UI as necessary
      // TODO 6: Create and configure a textarea element that will be used in App.js
    }
    ```

1. Replace `TODO 1` with the following code. To learn more about `useRef`, check out the [React documentation](https://reactjs.org/docs/hooks-reference.html#useref).

    ```js
    const sharedStringHelper = props.sharedStringHelper;  // Instance of SharedStringHelper class

    const textareaRef = React.useRef(null);  // Ref for HTML textarea element
    const selectionStartRef = React.useRef(0);  // Ref for start of selected text
    const selectionEndRef = React.useRef(0);  // Ref for end of selected text

    const [text, setText] = React.useState(sharedStringHelper.getText());  // Store textarea text in React state
    ```

1. Replace `TODO 2` with the following code. This function will be called when a change is made to the `textarea` element.

    ```js
    const handleChange = (ev) => {
      // First get and stash the new textarea state
      if (!textareaRef.current) {
        throw new Error("Handling change without current textarea ref?");
      }
      const textareaElement = textareaRef.current;
      const newText = textareaElement.value;
      const newCaretPosition = textareaElement.selectionStart;

      // Next get and stash the old React state
      const oldText = text;
      const oldSelectionStart = selectionStartRef.current;
      const oldSelectionEnd = selectionEndRef.current;

      // Next update the React state with the values from the textarea
      storeSelectionInReact();
      setText(newText);

      // Finally update the SharedString with the values after deducing what type of change it was.
      const isTextInserted = newCaretPosition - oldSelectionStart > 0;
      if (isTextInserted) {
        const insertedText = newText.substring(oldSelectionStart, newCaretPosition);
        const isTextReplaced = oldSelectionEnd - oldSelectionStart > 0;
        if (!isTextReplaced) {
          sharedStringHelper.insertText(insertedText, oldSelectionStart);
        } else {
          sharedStringHelper.replaceText(insertedText, oldSelectionStart, oldSelectionEnd);
        }
      } else {
        // Text was removed
        const charactersDeleted = oldText.length - newText.length;
        sharedStringHelper.removeText(newCaretPosition, newCaretPosition + charactersDeleted);
      }
    };
    ```

1. Replace `TODO 3` with the following code. This function sets the selection directly in the `textarea` element.

    ```js
    const setTextareaSelection = (newStart, newEnd) => {
      if (!textareaRef.current) {
        throw new Error("Trying to set selection without current textarea ref?");
      }
      const textareaElement = textareaRef.current;
      textareaElement.selectionStart = newStart;
      textareaElement.selectionEnd = newEnd;
    };
    ```

1. Replace `TODO 4` with the following code. This function sets the selection from the `textarea` element and sets it in the React refs.

    ```js
    const storeSelectionInReact = () => {
      if (!textareaRef.current) {
        throw new Error("Trying to remember selection without current textarea ref?");
      }
      const textareaElement = textareaRef.current;

      const textareaSelectionStart = textareaElement.selectionStart;
      const textareaSelectionEnd = textareaElement.selectionEnd;
      selectionStartRef.current = textareaSelectionStart;
      selectionEndRef.current = textareaSelectionEnd;
    };
    ```

1. Replace `TODO 5` with the following code. Note about this code:
    - By setting the dependency array at the end of `useEffect` to include `sharedStringHelper`, it is ensured that this function is called each time the `sharedStringHelper` object is changed.

    ```js
    React.useEffect(() => {
      const handleTextChanged = (event) => {
        const newText = sharedStringHelper.getText();
        setText(newText);
        if (!event.isLocal) {
          const newSelectionStart = event.transformPosition(selectionStartRef.current);
          const newSelectionEnd = event.transformPosition(selectionEndRef.current);
          setTextareaSelection(newSelectionStart, newSelectionEnd);
          storeSelectionInReact();
        }
      };

      sharedStringHelper.on("textChanged", handleTextChanged);
      return () => {
        sharedStringHelper.off("textChanged", handleTextChanged);
      };
    }, [sharedStringHelper]);
    ```

1. Finally, replace `TODO 6` with the following code to create the `textarea` element.

    ```js
    return (
    <textarea
      rows={20}
        cols={50}
        ref={textareaRef}
        onBeforeInput={storeSelectionInReact}
        onKeyDown={storeSelectionInReact}
        onClick={storeSelectionInReact}
        onContextMenu={storeSelectionInReact}
        onChange={handleChange}
        value={text} />
    );
    ```

## Start the Fluid server and run the application

In the Command Prompt, run the following command to start the Fluid service. Note that `tinylicious` is the name of the Fluid service that runs on localhost.

```dotnetcli
npx tinylicious
```

Open a new Command Prompt and navigate to the root of the project; for example, `C:/My Fluid Projects/collaborative-text-area-tutorial`. Start the application server with the following command. The application opens in your browser. This may take a few minutes.

```dotnetcli
npm run start
```

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Edit the text on any client and see the text change and synchronize on all the clients.

## Next steps

- Try extending the demo with more Fluid DDSes and a more complex UI.
- Consider using the [Fluent UI React controls](https://aka.ms/fluentui/) to give the application the look and feel of Microsoft 365. To install them in your project run the following in the command prompt: `npm install @fluentui/react`.
- For an example that will scale to larger applications and larger teams, check out the [React Starter Template in the FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/react-starter-template).

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press Ctrl-C twice. Then run `npm run start` again.

{{< /callout >}}
