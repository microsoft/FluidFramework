/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Empties a directory on the file system.
 *
 * @param {string} directory
 */
 const emptyDirectory = (directory) => {
    fs.readdir(directory, (err, files) => {
        if (err) throw err;

        for (const file of files) {
            fs.unlink(path.join(directory, file), err => {
                if (err) throw err;
            });
        }
    });
}
