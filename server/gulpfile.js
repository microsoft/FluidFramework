var gulp = require("gulp");
var plumber = require('gulp-plumber');
var ts = require("gulp-typescript");
var tsProject = ts.createProject("tsconfig.json");

gulp.task("default", function () {
    var errors = false;

    return gulp.src(['src/**/*.ts', 'typings/index.d.ts'])
        .pipe(plumber(function() { errors = true; } ))      
        .pipe(ts(tsProject))        
        .js.pipe(gulp.dest("dist"))
        .on('end', function() {
            if (errors) {
                console.error("Build failed");
                process.exit(1);
            } 
        })
});