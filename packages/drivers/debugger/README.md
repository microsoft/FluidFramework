# @fluidframework/debugger

Fluid Debugger is useful tool to replay file history. This can be useful as learning tool, as well as tool to investigate corruption or performance issues, or as content recovery tool. It provides read-only document and ability to start with a particular snapshot (or no snapshot at all), and play ops one by one, or in big batches.

Fluid Debugger works as an adapter on top of any document storage. In other words, it can be integrated into any app using any storage endpoint (like SPO or Routerlicious) with minimal changes to application and can be used to replay history with full app code running, thus helping investigating bugs in any layer of application stack

## How to Enable it

In order to use it, these changes are required:

1. Wrap existing storage:
    - If you have IDocumentService object, wrap it with **FluidDebugger.createFromService()** call (note that it's async call)
    - Or, If you have IDocumentServiceFactory, wrap it with **FluidDebugger.createFromServiceFactory()** call
2. In Dev Tools console, do
    > **localStorage.FluidDebugger = 1**
    >
    > > Fluid app has UI toggle for it - Settings | debbuger = on
3. Once you refresh page, look for blocked (by browser) pop-up window notification. Enable pop-ups for your app.

## How to disable it

1. In Dev Tools console, run
    > **delete localStorage.FluidDebugger**

## How it works

### Selecting where to start

Once debugger starts, you have the following choices on first screen:

![picture alt](images/Screenshot1.jpg "Screenshot of debugger, first page")

1. Close window. Debugger will be disabled and normal document flow would proceed - document is read/write. In all other options document is read-only, i.e. no local changes are committed to storage.

2. Start with no snapshot, i.e. use only ops to play history of the file from start

3. Use a particular snapshot to start with (use dropdown). You will see a selection of snapshots (with cryptic names) as well as starting sequence number for each of them in dropdown, sorted (with latest at the top). Please note that dropdown is populated asynchronously - there is progress text on the page noting that.

4. Use snapshot stored on disk (_"snapshot.json"_), produced by [replay tool](../../tools/replay-tool/README.md). This option is useful if you want to validate that generation and loading of snapshot (from set of ops) does not introduce a bug. This is useful, given there is no other way to generate snapshot at particular point in time in the past. Notes:
    - Currently you can't play ops on top of snapshot in this mode (to be added in the future).
    - You can load snapshot from a different file (given above). As long as it's for same application, it does not matter if same file or storage endpoint is used to start an app.

### Playing ops

If you chose storage snapshot (not snapshot from file) or no snapshot, you are presented with a screen that allows you to play ops (on top of snapshot). You can chose any number of ops to play at once and click "Go" button:

![picture alt](images/Screenshot2.jpg "Screenshot of debugger, second page")

Please note that playback is asynchronous, so even though Debugger UI might have acknowledged that ops where played out (and you can select next batch), application might be still in the process of processing previous batch.

## Internals, or useful piece to use in other workflows

Debugger consists of three mostly independent from each other pieces - UI, Controller & Storage layer. One can substitute UI and/or controller with alternative representation pretty easily, thus build different tool (like document recovery tool).

**IDebuggerController** is an interface that controls replay logic, but not UI. An implementation of this interface is provided: **DebugReplayController**

**IDebuggerUI** is an interface that controls UI and has no control logic. **DebuggerUI** is an implementation of that interface.

**FluidDebugger.createFluidDebugger()** is an example of binding logic & UI implementations

There are useful stand-alone implementations of **IDocumentStorageService** interface are provided as part of debugger:

1. **FileSnapshotReader** - file based storage. It reads content from file (snapshot.json) and expects **IFileSnapshot** format, uses content of such file to serve document requests.
2. **SnapshotStorage** - storage based on particular snapshot (in real storage). Requires snapshots' root ISnapshotTree to be provided at construction time.
3. **OpStorage** - op-based storage (i.e. it rejects all requests for snapshots / trees).
