---
title: Building a collaborative TextArea
menuPosition: 4
author: scottn12
---

In this tutorial, you'll learn how to use the [SharedString]({{< relref "string.md" >}}) distributed data structure (DDS) with [React](https://reactjs.org/) to create a collaborative text area. SharedString is a DDS with specialized features and behaviors for working with text.

To jump ahead into the finished demo, check out the [SharedString example in our FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/collaborative-text-area).

The following image shows a textarea open in four browsers. The same text is in all four.

![Four browsers with the textarea open with the same text.](https://fluidframework.blob.core.windows.net/static/images/collaborative_text_area_1.png)

The next image shows the same four clients after an edit was made in one of the browsers. Note that the text has updated in all four browsers.

![Four browsers with the textarea open after an edit was made in one browser.](https://fluidframework.blob.core.windows.net/static/images/collaborative_text_area_2.png)

{{< callout note >}}

This tutorial assumes that you are familiar with the [Fluid Framework Overview]({{< relref "/docs/_index.md" >}}) and that you have completed the [Quick Start]({{< relref "quick-start.md" >}}). You should also be familiar with the basics of [React](https://reactjs.org/), [creating React projects](https://reactjs.org/docs/create-a-new-react-app.html#create-react-app), and [React Hooks](https://reactjs.org/docs/hooks-intro.html).

{{< /callout >}}

## Create the project

1. Open a Command Prompt and navigate to the parent folder where you want to create the project, e.g., `C:\My Fluid Projects`.
1. Run the following command at the prompt. (Note that the CLI is np**x**, not npm. It was installed when you installed Node.js.)

    ```dotnetcli
    npx create-react-app collaborative-text-area-tutorial --template typescript
    ```

1. The project is created in a subfolder named `collaborative-text-area-tutorial`. Navigate to it with the command `cd collaborative-text-area-tutorial`.
1. The project uses three Fluid libraries:

    |Library |Description |
    |---|---|
    | `fluid-framework`    |Contains the SharedString [distributed data structure]({{< relref "dds.md" >}}) that synchronizes text across clients. *This object will hold the most recent text update made by any client.*|
    | `@fluidframework/tinylicious-client`   |Defines the connection to a Fluid server and defines the starting schema for the [Fluid container]({{< relref "containers.md" >}}).|
    | `@fluid-experimental/react-inputs`   |Contains the SharedStringHelper class that provides helper APIs to interact with the [SharedString]({{< relref "string.md" >}}) object.|
    {.table}

    Run the following command to install the libraries.

    ```dotnetcli
    npm install @fluidframework/tinylicious-client @fluid-experimental/react-inputs fluid-framework
    ```

## Code the project

1. Open the file `\src\App.tsx` in your code editor. Delete all the default `import` statements except the one that imports `App.css`. Then delete all the markup from the `return` statement. The file should look like the following:

    ```ts
    import "./App.css";

    function App() {
      return (

      );
    }

    export default App;
    ```

1. Add the following `import` statements. Note: `CollaborativeTextArea` will be defined later.

    ```ts
    import React from "react";
    import { TinyliciousClient } from "@fluidframework/tinylicious-client";
    import { SharedString } from "fluid-framework";
    import { CollaborativeTextArea } from "./CollaborativeTextArea";
    import { SharedStringHelper } from "@fluid-experimental/react-inputs";
    ```

### Get Fluid Data

1. The Fluid runtime will bring changes made to the text from any client to the current client, but Fluid is agnostic about the UI framework. You can use a React hook to get the Fluid data from the SharedString object into the view layer (the React state). Add the following code below the `import` statements. This method is called when the application loads the first time, and the returned value is assigned to a React state property.

    ```ts
    const useSharedString = (): SharedString => {

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

    ```ts
      const client: TinyliciousClient = new TinyliciousClient();
      const containerSchema: ContainerSchema = {
        initialObjects: { sharedString: SharedString }
      }
    ```

1. Replace `TODO 2` with the following code. Note that `containerId` is being stored on the URL hash, and if there is no `containerId` a new container is created instead.

    ```ts
      let container: IFluidContainer;
      const containerId = window.location.hash.substring(1);
      if (!containerId) {
        container = (await client.createContainer(containerSchema)).container;
        const id = await container.attach();
        window.location.hash = id;
      }
      else {
        container = (await client.getContainer(containerId, containerSchema)).container;
        if (!container.connected) {
          await new Promise<void>((resolve) => {
            container.once("connected", () => {
              resolve();
            });
          });
        }
      }
    ```

1. Replace `TODO 3` with the following code.

    ```ts
    return container.initialObjects.sharedString as SharedString;
    ```

1. Replace `TODO 4` with the following code. Note about this code:
    - By setting an empty dependency array at the end of the `useEffect`, it is ensured that this function only gets called once.
    - Since `setSharedString` is a state-changing method, it will cause the React `App` component to immediately rerender.

    ```ts
    React.useEffect(() => {
      getFluidData()
        .then(data => setSharedString(data));
    }, []);
    ```

1. Finally, replace `TODO 5` with the following code.

    ```ts
    return sharedString as SharedString;
    ```

### Move the Fluid Data to the view

Inside the `App()` function, add the following code. Note about this code:
- The `sharedString` object returned from the code above is used to create a `SharedStringHelper` object, which is a class that provides helper APIs to interact with the `sharedString` object.
- Next, the `SharedStringHelper` object is passed into the `CollaborativeTextArea` React component, which integrates `SharedString` with the default `textarea` HTML element to enable collaboration.

```ts
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
### Create CollaborativeTextArea component

`CollaborativeTextArea` is a React component which uses a `SharedStringHelper` object to control the text of an HTML `textarea` element. Follow the below steps to create this component.

1. Create a new file `CollaborativeTextArea.tsx` inside of the `\src` directory.
1. Add the following import statements and declare the `CollaborativeTextArea` component:

    ```ts
    import React from "react";
    import { ISharedStringHelperTextChangedEventArgs, SharedStringHelper } from "@fluid-experimental/react-inputs";

    interface ICollaborativeTextAreaProps {
      sharedStringHelper: SharedStringHelper;
    }

    export const CollaborativeTextArea = (props) => {
      // TODO 1: Setup React state and references
      // TODO 2: Handle a change event in the textarea
      // TODO 3: Set the selection in textarea element (update the UI)
      // TODO 4: Store current selection from the textarea element in the React ref
      // TODO 5: Detect changes in sharedStringHelper and update React/UI as necessary
      // TODO 6: Create and configure a textarea element that will be used in App.tsx
    }
    ```

1. Replace `TODO 1` with the following code. To learn more about `useRef`, check out the [React documentation](https://reactjs.org/docs/hooks-reference.html#useref).

    ```ts
    const sharedStringHelper = props.sharedStringHelper;

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const selectionStartRef = React.useRef<number>(0);
    const selectionEndRef = React.useRef<number>(0);

    const [text, setText] = React.useState<string>(sharedStringHelper.getText());
    ```

1. Replace `TODO 2` with the following code. This function will be called when a change is made to the `textarea` element.

    ```ts
    const handleChange = (ev: React.FormEvent<HTMLTextAreaElement>) => {
      // First get and stash the new textarea state
      if (!textareaRef.current) {
        throw new Error("Handling change without current textarea ref?");
      }
      const textareaElement = textareaRef.current;
      const newText = textareaElement.value;
      // After a change to the textarea content we assume the selection is gone (just a caret)
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

    ```ts
    const setTextareaSelection = (newStart: number, newEnd: number) => {
      if (!textareaRef.current) {
        throw new Error("Trying to set selection without current textarea ref?");
      }
      const textareaElement = textareaRef.current;

      textareaElement.selectionStart = newStart;
      textareaElement.selectionEnd = newEnd;
    };
    ```

1. Replace `TODO 4` with the following code. This function sets the selection from the `textarea` element and sets it in the React refs.

    ```ts
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

    ```ts
    React.useEffect(() => {
      const handleTextChanged = (event: ISharedStringHelperTextChangedEventArgs) => {
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

    ```ts
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

Open a new Command Prompt and navigate to the root of the project; for example, `C:\My Fluid Projects\collaborative-text-area-tutorial`. Start the application server with the following command. The application opens in your browser. This may take a few minutes.

```dotnetcli
npm run start
```

Paste the URL of the application into the address bar of another tab or even another browser to have more than one client open at a time. Edit the text on any client and see the text change and synchronize on all the clients.

{{< callout note >}}

You may need to install an additional dependency to make this demo compatible with Webpack 5. If you receive a compilation error related to a "buffer" package, please run `npm install -D buffer` and try again. This will be resolved in a future release of Fluid Framework.

{{< /callout >}}

## Next steps

- Try extending the demo with more Fluid DDSes and a more complex UI.
- Consider using the [Fluent UI React controls](https://aka.ms/fluentui/) to give the application the look and feel of Microsoft 365. To install them in your project run the following in the command prompt: `npm install @fluentui/react`.
- For an example that will scale to larger applications and larger teams, check out the [React Starter Template in the FluidExamples repo](https://github.com/microsoft/FluidExamples/tree/main/react-starter-template).

{{< callout tip >}}

When you make changes to the code the project will automatically rebuild and the application server will reload. However, if you make changes to the container schema, they will only take effect if you close and restart the application server. To do this, give focus to the Command Prompt and press <kbd>Ctrl-C</kbd> twice. Then run `npm run start` again.

{{< /callout >}}
