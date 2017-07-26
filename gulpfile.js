const gulp = require('gulp');
//const runSeq = require('run-sequence');
const nodemon = require('gulp-nodemon');

gulp.task('js', function () {
	return gulp.src('src/**/*.js')
		.pipe(gulp.dest('dist'));
});

gulp.task('copy', function () {
	return gulp.src(['src/**/*.json'])
		.pipe(gulp.dest('dist'));
});


gulp.task('dev', ['default', 'devserver'], function() {
	gulp.watch('src/**/*.js', ['js']);
});

gulp.task('reload', function(cb) {

});

gulp.task('devserver', function () {

  nodemon({
		watch: 'dist',
    script: 'dist/index.js',
		//delay: 200,
		verbose: true,
		env: { 
			'NODE_ENV': 'development', 
			'NODE_CONFIG': 'config/development.json',
		},
  })


})


gulp.task('default', ['js', 'copy'])

