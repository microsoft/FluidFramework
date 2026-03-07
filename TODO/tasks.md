## Completed

[x] Fix property-dds tests hanging: added opProcessingController.reset() and objProvider.reset()
    in afterEach hooks to dispose containers (clears GC sessionExpiryTimer).
    Root cause: deltaConnectionServer.close() alone doesn't dispose containers.

[x] Remove --exit from local-server-stress-tests: harness already properly disposes
    containers and closes server in finally block.

## Next

[] Verify a broader set of packages exits cleanly by running pnpm test:mocha from root
   (spot-check some packages not in the investigation list)
[] Update investigation.md with new findings about container disposal pattern
