var childProcess = require('child_process'),
	Stream = require('stream').Stream,
	util = require('util'),
	fs = require('fs'),
	getTemporaryFilePath = require('gettemporaryfilepath');

function PngOut(pngOutArgs) {
	Stream.call(this);

	this.pngOutArgs = pngOutArgs || [];

	this.writable = this.readable = true;

	this.pngOutInputFilePath = getTemporaryFilePath({suffix: '.png'});
	this.writeStream = fs.createWriteStream(this.pngOutInputFilePath);
	this.writeStream.on('error', function (err) {
		this.emit('error', err);
	}.bind(this));
}

util.inherits(PngOut, Stream);

PngOut.prototype.write = function (chunk) {
	this.writeStream.write(chunk);
};

PngOut.prototype.end = function (chunk) {
	if (chunk) {
		this.write(chunk);
	}
	this.writeStream.end();
	this.writable = false;
	this.writeStream.on('close', function () {
		var pngOutOutputFilePath = getTemporaryFilePath({suffix: '.png'}),
			pngOutProcess = childProcess.spawn('pngout', this.pngOutArgs.concat(this.pngOutInputFilePath, pngOutOutputFilePath)),
			stdoutChunks = [];

		pngOutProcess.stdout.on('data', function (chunk) {
			stdoutChunks.push(chunk);
		});

		pngOutProcess.on('exit', function (exitCode) {
			if (exitCode > 0) {
				return this.emit('error', new Error('The pngout process exited with a non-zero exit code: ' + exitCode));
			}
			fs.unlink(this.pngOutInputFilePath, function (err) {
				if (err) {
					console.error(err.stack);
				}
			});
			fs.stat(pngOutOutputFilePath, function (err, stats) {
				if (err) {
					return this.emit('error', new Error('pngout did not write an output file, stdout output:\n' + Buffer.concat(stdoutChunks).toString('ascii')));
				}
				this.readStream = fs.createReadStream(pngOutOutputFilePath);
				if (this.isPaused) {
					this.readStream.pause();
				}
				this.readStream.on('data', function (chunk) {
					this.emit('data', chunk);
				}.bind(this));
				this.readStream.on('end', function () {
					fs.unlink(pngOutOutputFilePath, function (err) {
						if (err) {
							console.error(err.stack);
						}
					});
					this.emit('end');
				}.bind(this));
			}.bind(this));
		}.bind(this));
	}.bind(this));
};

// Proxy pause and resume to the underlying readStream if it has been
// created, otherwise just keep track of the paused state:
PngOut.prototype.pause = function () {
	this.isPaused = true;
	if (this.readStream) {
		this.readStream.pause();
	}
};

PngOut.prototype.resume = function () {
	this.isPaused = false;
	if (this.readStream) {
		this.readStream.resume();
	}
};

module.exports = PngOut;
