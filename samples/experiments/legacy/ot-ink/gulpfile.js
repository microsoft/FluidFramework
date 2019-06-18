/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var clean = require("gulp-clean");
var gulp = require("gulp");
var path = require('path');
var sourcemaps = require('gulp-sourcemaps');
var ts = require("gulp-typescript");
var tslint = require("gulp-tslint");
var tsProject = ts.createProject('tsconfig.json');

// Cleans up generated files
gulp.task("clean", function () {
    return gulp.src(['dist'], { read: false }).pipe(clean());
})

// Builds the server JavaScript code
gulp.task("build", function () {
    return gulp.src(['src/**/*.ts'])
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .pipe(sourcemaps.write('.', {
            includeContent: false, sourceRoot: function (file) {
                return path.join(file.cwd, './src');
            }
        }))
        .pipe(gulp.dest("dist"))
});

// Linting to validate style guide
gulp.task("tslint", () =>
    gulp.src(['src/**/*.ts'])
        .pipe(tslint({
            formatter: "verbose"
        }))
        .pipe(tslint.report())
);

gulp.task("default", ["tslint", "build"]);