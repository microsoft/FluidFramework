# Building your own component

To build your own component we will start with one of our existing examples. While you can start with any I would
recommend using one of our simpler examples so there is less code to remove.

We have a Dice Roller example that uses React and one that is straight VanillaJS. The Fluid Framework is view-agnostic
so if you wanted to use Vue, Angular, or [insert your favorite framework here] you can start with the VanillaJS version
and extend the `render(...)` function to render using your framework. Looking at how the Dice Roller renders in
VanillaJS vs. React should help guide you with your View framework.

<vue-markdown v-if="$themeConfig.DOCS_AUDIENCE === 'internal'">

- [Dice roller - React](https://github.com/microsoft/fluid-tutorial-dice-roller-react)
- [Dice roller VanillaJS](https://github.com/microsoft/fluid-tutorial-dice-roller)

</vue-markdown>
<vue-markdown v-else>

- [Dice roller - React](https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-dice-roller-react-tutorial)
- [Dice roller
   VanillaJS](https://dev.azure.com/FluidDeveloperProgram/Developer%20Preview/_git/fluid-dice-roller-vanillajs-tutorial)

</vue-markdown>

For the purpose of this Doc I'm going to use the `Dice roller - React` repo as our existing example we are working from.

## Steps

1. Open your Command Prompt (or terminal) and navigate to where you want to create your repo folder
2. Clone the repo in a folder with a new name. Ideally the name of your new Component.


   ```script
   git clone {URL FOR TUTORIAL REPO} {NEW FOLDER NAME}
   ```

3. Navigate into your new folder

   ````script
   cd {NEW FOLDER NAME}
   ````

4. Install dependencies

   ```script
   npm i
   ```

5. Run setup to rename your Component and choose a Fabric Icon. This name will be used in dropdown on fluidpreview.com.
   Ensure you press `y` to customize and click `y` when prompted to overwrite each of the 3 files. It's simply appending
   new ids and adding SPO-specific packages if they are not already there.

   ::: tip
   You can run setup at anytime to change the Name/Icon.
   :::

   ```script
   npm run setup
   ...
   ...
   It seems you have a config already. Want to further customize it? (y/N) y
   ...
   ...
   Overwrite package.json? (ynaxdH) y
   ...
   Overwrite config\package-solution.json? (ynaxdH) y
   ...
   Overwrite src\Component.sppkg.manifest.json? (ynaxdH) y
   ```

6. Push to your own repo (Optional)

   You will have permission to pull and branch code locally but will not have permissions to push back or create repos.
   You should feel free to push your code to your own favorite history manager. If you're using **AzureDevOps** create a
   new empty repo. Follow the instructions of *Push an existing repository from command line* which should look
   something like:

   ```script
   git remote add origin {repo link}
   git push -u origin --all
   ```

   If you're using **GitHub** create a new empty repo. You can then run this:

   ```script
   git push url:///new/repo.git master
   ```
