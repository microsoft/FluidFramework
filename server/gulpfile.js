var gulp = require("gulp");
var browserify = require("browserify");
var source = require("vinyl-source-stream");
var tsify = require("tsify");
var plumber = require('gulp-plumber');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");
var clean = require("gulp-clean");
var sourcemaps = require('gulp-sourcemaps');
var path = require('path');

// Cleans up generated files
gulp.task("clean", function() {
    return gulp.src(['dist', 'public/dist'], { read: false })        
        .pipe(clean());
})

// Builds the server side JavaScript
gulp.task("build", function () {
    var errors = false;

    return gulp.src(['src/**/*.ts', 'typings/index.d.ts'])
        .pipe(plumber(function() { errors = true; } ))      
        .pipe(sourcemaps.init())
        .pipe(ts(tsProject))
        .js
        .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function(file) {                         
            return path.join(file.cwd, './src'); 
        } }))    
        .pipe(gulp.dest("dist"))
        .on('end', function() {
            if (errors) {
                console.error("Build failed");
                process.exit(1);
            } 
        })
});

// Site app
gulp.task("browserify", function() {
    return browserify({
            basedir: '.',
            debug: true,
            entries: ['src/ng/main.ts'],
            cache: {},
            packageCache: {}
        })        
        .plugin(tsify)        
        .bundle()        
        .pipe(source('main.js'))
        .pipe(gulp.dest("public/dist/ng"))
});

// Client side Interactive Document API
gulp.task("api", function() {
    return browserify({
            basedir: '.',
            debug: true,
            entries: ['src/api/index.ts'],
            cache: {},
            packageCache: {},
            standalone: 'pronet'
        })        
        .plugin(tsify)        
        .bundle()        
        .pipe(source('api.js'))
        .pipe(gulp.dest("public/dist/api"))
});

// Calendar app
gulp.task("calendar", function() {
    return browserify({
            basedir: '.',
            debug: true,
            entries: ['src/calendar/driver.ts'],
            cache: {},
            packageCache: {}
        })        
        .plugin(tsify)        
        .bundle()        
        .pipe(source('driver.js'))
        .pipe(gulp.dest("public/dist/views/calendar"))
});

gulp.task("default", ["build", "browserify", "api", "calendar"]);