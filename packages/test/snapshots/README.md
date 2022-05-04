# @fluid-internal/test-snapshots

## Syncing snapshot tests content
If it is the first time you are syncing the content for the snapshot tests, you need to run the following command:

```
git submodule update --init --recursive
```

This will pull all the content down to enable running the snapshot tests. The content will be under the `content` subdirectory.

You can run the tests by running the following command:

```
npm run test
```

## Submit changes to test content
For submitting changes to the snapshot test content, follow these steps:
- Submitting the changes to the test content:
  - Sync the content for the snapshot tests as mentioned [here](#Syncing-snapshot-tests-content).
  - Go to the `content` subdirectory, create a new branch and update the snapshot content. Ideally, you should not update the content manually but follow one of these:
    - [Adding new snapshots](#Adding-new-snapshots-to-the-repo) - If you are adding new snapshots.
    - [Updating existing snapshots](#Updating-existing-snapshots-in-the-repo) - If you updating existing snapshots.
  - Create a commit and push the new branch.
  - Create a PR against `main` branch in the [FluidFrameworkTestData](https://github.com/microsoft/FluidFrameworkTestData) repo. Get the changes approved and merge the PR.
  - Checkout `main` branch and run `git pull` to ensure it has your new changes.
- Updating FluidFramework repo to point to the new content:
  - Go to the FluidFramework repo root. `git status` should show changes under `packages/test/snapshots/content`. For example:
  ```
  D:\FluidFramework>git status
  On branch updateTestSnapshots
  Your branch is up to date with 'origin/updateTestSnapshots'.

  Changes not staged for commit:
    (use "git add <file>..." to update what will be committed)
    (use "git restore <file>..." to discard changes in working directory)
          modified:   packages/test/snapshots/content (new commits)

  no changes added to commit (use "git add" and/or "git commit -a")

  D:\FluidFramework>
  ```
  - Commit these changes to a new branch in the [FluidFramework](https://github.com/microsoft/FluidFramework) repo.
  - Create a PR against `main`, get the changes approved and merge the PR. FluidFramework repo will now point to the new test contents.

## Adding new snapshots to the repo
To add new reference snapshots to the repo for a document, follow tests steps:
- Use the [fetch-tool](../../tools/fetch-tool/README.md) tool to fetch and save the snapshots and ops for the document.
- Create a folder for the new snapshots under [snapshotTestContent](./content/snapshotTestContent).
- Add the `message.json` file from the output of the [fetch-tool](../../tools/fetch-tool/README.md) to the new folder.
- Create a sub-folder called `base_snapshot`. From the output of the [fetch-tool](../../tools/fetch-tool/README.md), add the contents of the oldest snapshot (except `tree-original.json` and `decoded` folder).
  - The downloaded snapshots are in folders whose names are in format `<number>-<versionId>`. The oldest snapshot is in a folder that starts with the highest `number`.
  - Following is an example output of [fetch-tool](../../tools/fetch-tool/README.md):
    ```
    C:\snapshots>dir
    07/26/2021  05:28 PM    <DIR>          .
    08/02/2021  01:19 PM    <DIR>          ..
    07/26/2021  05:28 PM    <DIR>          0-bB8gBAAAHAAAA
    07/26/2021  05:28 PM    <DIR>          1-bBwAAAAAHAAAA
    07/26/2021  05:28 PM               680 info.json
    07/26/2021  05:28 PM           641,806 messages.json
                2 File(s)        642,486 bytes
                4 Dir(s)  243,849,199,616 bytes free
    ```
    There are two snapshots in folders `0-bB8gBAAAHAAAA` and `1-bBwAAAAAHAAAA`. The oldest snapshot folder is `1-bBwAAAAAHAAAA` whose contents are:
    ```
    C:\snapshots\1-bBwAAAAAHAAAA>dir
    07/26/2021  05:28 PM    <DIR>          .
    07/26/2021  05:28 PM    <DIR>          ..
    07/26/2021  05:28 PM                40 0-bARBrcuSOLdT_lXwAHWYYa4cJ
    07/26/2021  05:28 PM                74 1-bARAWgNwwMAtEWFX6f8eXjarD
    07/26/2021  05:28 PM               146 3-bARC8xAwm8aYZEMbE2vbPYiTA
    07/26/2021  05:28 PM               104 4-bARDE9u7Ztbm4_xyTBb9dmJKd
    07/26/2021  05:28 PM               242 5-bARBgXKoar1aPt2TC8hgpvFzw
    07/26/2021  05:28 PM               130 6-bARBTxqdFc58itZIePNAhBxVd
    07/26/2021  05:28 PM                83 7-bARCBnzMy4FNE7kexVfsvTEs0
    07/26/2021  05:28 PM               183 8-bARCZTcvC68fmXTMjacLU6Tct
    07/26/2021  05:28 PM               351 9-bARBk1cbwDcU8wOEeGmmuJxxh
    07/26/2021  05:28 PM    <DIR>          decoded
    07/26/2021  05:28 PM             2,231 tree-original.json
    07/26/2021  05:28 PM             2,308 tree.json
                27 File(s)          9,229 bytes
                3 Dir(s)  243,653,701,632 bytes free
    ```
    Copy everything in this folder except `tree-original.json` and `decode` to the `base_snapshot` directory created above.
- Scrub the newly added files of PII manually by replacing your id, your name, your email, and any other PII.
  - A shortcut you can use is right-click and `Find in Folder...`.
  - Feel free to use any replaced names, emails, and ids already in the files.
  - There is a tool in `packages\drivers\debugger\src\sanitize.ts` that can be applied to one file at a time.
- Run the following from the `packages\test\snapshots` directory:
  ```
  npm run test:new
  ```
  This will generate the snapshots for this based on the current version of the runtime. These new snapshots will be under `current_snapshots` directory.
- Run the tests to validate that all the tests pass with the new snapshots.
- Submit the changes by following the steps [here](#Submit-changes-to-test-content).

## Updating existing snapshots in the repo
Whenever the snapshot format changes in the runtime, the existing snapshots in the repo needs to be updated by following these steps:
- Run the following from the `packages\test\snapshots` directory:
  ```
  npm run test:update
  ```
  This will save the current snapshots in the `src_snapshots\<current_snapshots_version>` directory. It will then update the current snapshots under the `current_snapshots` directory to the new format.
- Run the tests to validate that all the tests pass with the new snapshots.
  - Don't forget to always stay updated with main and reinstall and build if necessary.
- Submit the changes by following the steps [here](#Submit-changes-to-test-content).
