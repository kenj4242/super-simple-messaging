const conf = require('super-simple-node-config')();
const net = require('net');
const EventEmitter = require('events');
const MessageHandler = require('./protocol');

class Server extends EventEmitter {

	constructor(conf) {
		super(conf.protocol);
		conf.listen = conf.listen || {};
		this.conf = conf;
		this.socketcount = 0;
	}

	listen() {
		this.server = new net.Server();
		this.server.on('error', (e, s) => { this.errorHandler(e, s) });
		this.server.on('close', () => { this.closeHandler() });
		this.server.on('listening', () => { this.listeningHandler() });
		this.server.on('connection', s => { this.connectionHandler(s) });

		this.server.listen(this.conf.listen);
	}

	errorHandler(e, socket) {
		// if we get and addr in use error, clean up and try again
		if (e.code == 'EADDRINUSE') {
			console.log('Listen address in use, retrying...');
			this.server.close();
			setTimeout(() => {
				this.server.listen(this.conf.listen);
			}, 500);
		}
		this.emit('error', e);
	}

	closeHandler() {
		let path = this.conf.listen.path;
		if (path && path.length) {
			let unlink = require('fs').unlinkSync;
			unlink(path);
		}
		this.emit('close');
	}

	listeningHandler() {
		this.emit('listening', this.server);
	}

	connectionHandler(socket) {

		socket.myident = Symbol("socket-" + (++this.socketcount));

		var messager = new MessageHandler(socket, conf.protocol);

		messager.on('message', (m) => {
			this.emit('message', m, messager);
		});

		messager.on('error', (e) => {
			this.emit('error', e);
		});
	}
}


module.exports = Server;



