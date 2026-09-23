---
"__section": fix
"__includeInReleaseNotes": false
---
Keep Sea connection initialization responsive during slow storage synchronization

The built-in host performs namespace initialization, document creation, and recovery on blocking workers, retaining ownership through request cancellation.
Unix namespace initialization no longer synchronizes unrelated parent filesystems.
Required durability barriers remain in place; slow storage can still exceed a request deadline without blocking the network executor during initialization.