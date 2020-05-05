Service interface implementations that are safe to be run on the client or server

# Git Storage

Storage driver to save shared document snapshots as git repositories.

The long term hope is to be able to use our deltas as the stored values that allow you to transition between versions.
But for now we rely on git's own binary format for this.

[Git from the bottom up](http://stefan.saasen.me/articles/git-clone-in-haskell-from-the-bottom-up/)