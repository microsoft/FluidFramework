---

title: Connect your client-side web part to SharePoint (Hello World part 2)
description: Access functionality and data in SharePoint and provide a more integrated experience for end users.

---

Table of contents:

- Overview of example and goals
  - What we build will be usable in both the Fluid Preview App and Web Part pages
  - Learn about the SharedMap and SharedDirectory
  - Distributed data structures and SPFx


In this example we will build a collaborative Sudoku game. We will use Fluid distributed data structures to store and
synchronize the Sudoku data.

# Set up your dev environment

1. Install Node.js 10 and VS Code
1. Clone the following git repo
    1. (or copy a zip file)
1. Open the resulting folder in VS Code

## Folder layout

The project has the following folder layout:

```text
├───config
│       config.json
│       copy-assets.json
│       package-solution.json
│       write-manifests.json
├───copyToDist
│       906962ff-9406-47e2-9f63-a21cf04314ca.manifest.json
│       906962ff-9406-47e2-9f63-a21cf04314ca_color.png
│       906962ff-9406-47e2-9f63-a21cf04314ca_outline.png
│       package.json
└───src
    │   index.ts
    └───sudoku
        │   SudokuWebPart.tsx
        │   SudokuWebPart.manifest.json
        ├───helpers
        │       coordinate.ts
        │       puzzles.ts
        │       styles.css
        │       sudokuCell.ts
        └───view
                sudokuView.tsx
```

The *config* folder contains the WebPart configuration files. The *copyToDist* folder contains files that will be copied
to the **dist** folder when the project is built. Finally, the *src* folder contains the source files for the Sudoku
Fluid component, which we'll cover in more depth later.

# Run the sample locally

In order to run the example, run `npm start` from the project root. Then visit <http://localhost:8080/> in a browser.
Two instances of the Sudoku component will be loaded side by side. Try entering numbers in the cells in either component
instance. Changes will be synchronized to the other instance.

Try changing the theme in one of the components. Notice that these changes are not synchronized between the two
instances.

## Examine the code

The code consists of a React component called `SudokuView` that renders the Sudoku puzzle, a `SudokuWebPart` class that
inherits from `BaseMfxPart`, and an `index.ts` file that instantiates the Web Part.

### 



# Connect your client-side web part to SharePoint (Hello World part 2)

Connect your web part to SharePoint to access functionality and data in SharePoint and provide a more integrated
experience for end users. This article continues building the Hello World web part built in the previous article [Build
your first web part](./build-a-hello-world-web-part.md).

## Run gulp serve

Ensure that you have the `gulp serve` command running. If it is not already running, go to the **helloworld-webpart**
project directory and run it by using the following commands.

```shell
cd helloworld-webpart
gulp serve
```

## Get access to page context

When the Workbench is hosted locally, you do not have the SharePoint page context. You can still test your web part in
many different ways. For example, you can concentrate on building the web part's UX and use mock data to simulate
SharePoint interaction when you don't have the SharePoint context.

However, when the Workbench is hosted in SharePoint, you get access to the page context, which provides various key
properties such as:

* Web title
* Web absolute URL
* Web server-relative URL
* User sign-in name

### To get access to the page context

To access contextual information in your web part, you'll be using the following object in your code:

```typescript
this.context.pageContext
```

1. Switch to Visual Studio code (or your preferred IDE) and open **src\webparts\helloWorld\HelloWorldWebPart.ts**.
1. Inside the **render** method, replace the **innerHTML** code block with the following code:

    ```tsx
    this.domElement.innerHTML = `
      <div class="${ styles.helloWorld }">
        <div class="${ styles.container }">
          <div class="${ styles.row }">
            <div class="${ styles.column }">
              <span class="${ styles.title }">Welcome to SharePoint!</span>
              <p class="${ styles.subTitle }">Customize SharePoint experiences using web parts.</p>
              <p class="${ styles.description }">${escape(this.properties.description)}</p>
              <p class="${ styles.description }">${escape(this.properties.test)}</p>
              <p class="${ styles.description }">Loading from ${escape(this.context.pageContext.web.title)}</p>
              <a href="https://aka.ms/spfx" class="${ styles.button }">
                <span class="${ styles.label }">Learn more</span>
              </a>
            </div>
          </div>
        </div>
      </div>`;
    ```

1. Notice how `${ }` is used to output the variable's value in the HTML block. An extra HTML `p` is used to display
   `this.context.pageContext.web.title`. Because this web part loads from the local environment, the title is **Local
   Workbench**.
1. Save the file. The `gulp serve` running in your console detects this save operation and:

    * Builds and bundles the updated code automatically.
    * Refreshes your local Workbench page (as the web part code needs to be reloaded).

    > [!NOTE] Keep the console window and Visual Studio Code side-by-side to see gulp automatically compile as you save
    > changes in Visual Studio Code.

1. In your browser, switch to the local **SharePoint Workbench** tab. If you have already closed the tab, the URL is
   `https://localhost:4321/temp/workbench.html`.

    You should see the following in the web part:

    ![SharePoint page context in localhost](../../../images/sp-mock-localhost-wp.png)

1. Navigate to the SharePoint Workbench hosted in SharePoint. The full URL is
   `https://your-sharepoint-site-url/_layouts/workbench.aspx`. Notice that on the SharePoint Online side, you need to
   refresh the page to see the changes.

    You should now see your SharePoint site title in the web part now that page context is available to the web part.

    ![SharePoint page context in SharePoint site](../../../images/sp-lists-spsiteurl-wp.png)

## Define list model

You need a list model to start working with SharePoint list data. To retrieve the lists, you need two models.

1. Switch to Visual Studio Code and go to **src\webparts\helloWorld\HelloWorldWebPart.ts**.
1. Define the following `interface` models just above the **HelloWorldWebPart** class:

    ```typescript
    export interface ISPLists {
      value: ISPList[];
    }

    export interface ISPList {
      Title: string;
      Id: string;
    }
    ```

    The **ISPList** interface holds the SharePoint list information that we are connecting to.

## Retrieve lists from mock store

To test in the local Workbench, you need a mock store that returns mock data.

### To create a mock store

1. Create a new file inside the **src\webparts\helloWorld** folder named **MockHttpClient.ts**.
1. Copy the following code into **MockHttpClient.ts**:

    ```typescript
    import { ISPList } from './HelloWorldWebPart';

    export default class MockHttpClient  {

        private static _items: ISPList[] = [{ Title: 'Mock List', Id: '1' },
                                            { Title: 'Mock List 2', Id: '2' },
                                            { Title: 'Mock List 3', Id: '3' }];

        public static get(): Promise<ISPList[]> {
        return new Promise<ISPList[]>((resolve) => {
                resolve(MockHttpClient._items);
            });
        }
    }
    ```

    Things to note about the code:

* Because there are multiple exports in **HelloWorldWebPart.ts**, the specific one to import is specified by using
  `{ }`. In this case, only the data model `ISPList` is required.
* You do not need to type the file extension when importing from the default module, which in this case is
  **HelloWorldWebPart**.
* It exports the **MockHttpClient** class as a default module so that it can be imported in other files.
* It builds the initial `ISPList` mock array and returns.

1. Save the file.

You can now use the **MockHttpClient** class in the **HelloWorldWebPart** class. You first need to import the
**MockHttpClient** module.

### To import the **MockHttpClient** module

1. Open the **HelloWorldWebPart.ts** file.
1. Copy and paste the following code just under `import * as strings from 'HelloWorldWebPartStrings';`.

    ```typescript
    import MockHttpClient from './MockHttpClient';
    ```

1. Add the following private method that mocks the list retrieval inside the **HelloWorldWebPart** class.

    ```typescript
    private _getMockListData(): Promise<ISPLists> {
      return MockHttpClient.get()
        .then((data: ISPList[]) => {
          var listData: ISPLists = { value: data };
          return listData;
        }) as Promise<ISPLists>;
    }
    ```

1. Save the file.

## Retrieve lists from SharePoint site

Next you need to retrieve lists from the current site. You will use SharePoint REST APIs to retrieve the lists from the
site, which are located at `https://yourtenantprefix.sharepoint.com/_api/web/lists`.

SharePoint Framework includes a helper class **spHttpClient** to execute REST API requests against SharePoint. It adds
default headers, manages the digest needed for writes, and collects telemetry that helps the service to monitor the
performance of an application.

### To use this helper class, import them from the @microsoft/sp-http module

1. Scroll to the top of the **HelloWorldWebPart.ts** file.
1. Copy and paste the following code just under `import MockHttpClient from './MockHttpClient';`:

    ```typescript
    import {
      SPHttpClient,
      SPHttpClientResponse
    } from '@microsoft/sp-http';
    ```

1. Add the following private method to retrieve lists from SharePoint inside the **HelloWorldWebPart** class.

    ```typescript
    private _getListData(): Promise<ISPLists> {
      return this.context.spHttpClient.get(this.context.pageContext.web.absoluteUrl + `/_api/web/lists?$filter=Hidden eq false`, SPHttpClient.configurations.v1)
        .then((response: SPHttpClientResponse) => {
          return response.json();
        });
    }
    ```

    The method uses the **spHttpClient** helper class and issues a `get` request. It uses the **ISPLists** model and
    also applies a filter to not retrieve hidden lists.

1. Save the file.
1. Switch to the console window that is running `gulp serve` and check if there are any errors. If there are errors,
   gulp reports them in the console, and you need to fix them before proceeding.

## Add new styles

The SharePoint Framework uses [Sass](http://sass-lang.com/) as the CSS pre-processor, and specifically uses the [SCSS
syntax](http://sass-lang.com/documentation/file.SCSS_FOR_SASS_USERS.html), which is fully compliant with normal CSS
syntax. Sass extends the CSS language and allows you to use features such as variables, nested rules, and inline imports
to organize and create efficient style sheets for your web parts. The SharePoint Framework already comes with a SCSS
compiler that converts your Sass files to normal CSS files, and also provides a typed version to use during development.

### To add new styles

1. Open **HelloWorldWebPart.module.scss**. This is the SCSS file where you define your styles.

    By default, the styles are scoped to your web part. You can see that as the styles are defined under
    **.helloWorld**.

1. Add the following styles after the `.button` style, but still inside the main `.helloWorld` style section:

    ```css
    .list {
      color: #333333;
      font-family: 'Segoe UI Regular WestEuropean', 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 14px;
      font-weight: normal;
      box-sizing: border-box;
      margin: 10;
      padding: 10;
      line-height: 50px;
      list-style-type: none;
      box-shadow: 0 4px 4px 0 rgba(0, 0, 0, 0.2), 0 25px 50px 0 rgba(0, 0, 0, 0.1);
    }

    .listItem {
      color: #333333;
      vertical-align: center;
      font-family: 'Segoe UI Regular WestEuropean', 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 14px;
      font-weight: normal;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      box-shadow: none;
      *zoom: 1;
      padding: 9px 28px 3px;
      position: relative;
    }
    ```

1. Save the file.

    Gulp rebuilds the code in the console as soon as you save the file. This generates the corresponding typings in the
    **HelloWorldWebPart.module.scss.ts** file. After compiled to TypeScript, you can then import and reference these
    styles in your web part code.

    You can see that in the **render** method of the web part:

    ```html
    <div class="${styles.row}">
    ```

## Render lists information

Open the **HelloWorldWebPart** class.

SharePoint Workbench gives you the flexibility to test web parts in your local environment and from a SharePoint site.
SharePoint Framework aids this capability by helping you understand which environment your web part is running from by
using the **EnvironmentType** module.

### To use the EnvironmentType module

1. Import the **Environment** and the **EnvironmentType** modules from the **@microsoft/sp-core-library** bundle. Add it
   to the **import** section at the top as shown in the following code:

    ```typescript
    import {
      Environment,
      EnvironmentType
    } from '@microsoft/sp-core-library';
    ```

1. Add the following private method inside the **HelloWorldWebPart** class:

    ```typescript
    private _renderList(items: ISPList[]): void {
      let html: string = '';
      items.forEach((item: ISPList) => {
        html += `
      <ul class="${styles.list}">
        <li class="${styles.listItem}">
          <span class="ms-font-l">${item.Title}</span>
        </li>
      </ul>`;
      });

      const listContainer: Element = this.domElement.querySelector('#spListContainer');
      listContainer.innerHTML = html;
    }
    ```

    This method references the new CSS styles added earlier by using the **styles** variable and is used to render list
    information which will be received from REST API.

1. Save the file.
1. Add the following private method inside the **HelloWorldWebPart** class to call the respective methods to retrieve
   list data:

    ```typescript
    private _renderListAsync(): void {
      // Local environment
      if (Environment.type === EnvironmentType.Local) {
        this._getMockListData().then((response) => {
          this._renderList(response.value);
        });
      }
      else if (Environment.type == EnvironmentType.SharePoint ||
                Environment.type == EnvironmentType.ClassicSharePoint) {
        this._getListData()
          .then((response) => {
            this._renderList(response.value);
          });
      }
    }
    ```

    Things to note about hostType in the **_renderListAsync** method:

    * The `Environment.type` property helps you check if you are in a local or SharePoint environment.
    * The correct method is called depending on where your Workbench is hosted.

1. Save the file.

## Retrieve list data

1. Navigate to the **render** method, and replace the code inside the method with the following code:

    ```typescript
    this.domElement.innerHTML = `
      <div class="${ styles.helloWorld }">
        <div class="${ styles.container }">
          <div class="${ styles.row }">
            <div class="${ styles.column }">
              <span class="${ styles.title }">Welcome to SharePoint!</span>
              <p class="${ styles.subTitle }">Customize SharePoint experiences using web parts.</p>
              <p class="${ styles.description }">${escape(this.properties.description)}</p>
              <p class="${ styles.description }">${escape(this.properties.test)}</p>
              <p class="${ styles.description }">Loading from ${escape(this.context.pageContext.web.title)}</p>
              <a href="https://aka.ms/spfx" class="${ styles.button }">
                <span class="${ styles.label }">Learn more</span>
              </a>
            </div>
          </div>
          <div id="spListContainer" />
        </div>
      </div>`;

      this._renderListAsync();
    ```

1. Save the file.

    Notice in the `gulp serve` console window that it rebuilds the code. Make sure you don't see any errors.

1. Switch to your local Workbench and add the HelloWorld web part.

    You should see the mock data returned.

    ![Render lists data from localhost](../../../images/sp-lists-render-localhost.png)

1. Switch to the Workbench hosted in SharePoint. Refresh the page and add the HelloWorld web part.

    You should see lists returned from the current site.

    ![Render lists data from SharePoint](../../../images/sp-lists-render-spsite.png)

1. Now you can stop the server from running. Switch to the console and stop `gulp serve`. Select Ctrl+C to terminate the
   gulp task.

## Next steps

Congratulations on connecting your web part to SharePoint list data!

You can continue building out your Hello World web part in the next topic [Deploy your web part to a SharePoint
page](./serve-your-web-part-in-a-sharepoint-page.md). You will learn how to deploy and preview the Hello World web part
in a SharePoint page.

> [!NOTE] If you find an issue in the documentation or in the SharePoint Framework, please report that to SharePoint
> engineering by using the [issue list at the sp-dev-docs repository](https://github.com/SharePoint/sp-dev-docs/issues)
> or by adding a comment to this article. Thanks for your input in advance.
