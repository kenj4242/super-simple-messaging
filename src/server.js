const net = require('net');
const EventEmitter = require('events');
const Messager = require('./messager');

class Server extends EventEmitter {

	constructor(conf) {
		super();
		this.conf = conf;
		this.socketcount = 0;
	}

	listen() {
		this.server = new net.Server();
		this.server.on('error', (e, s) => { this.errorHandler(e, s) });
		this.server.on('close', () => { this.closeHandler() });
		this.server.on('listening', () => { this.listeningHandler() });
		this.server.on('connection', s => { this.connectionHandler(s) });

		this.server.listen(this.conf);
	}

	errorHandler(e, socket) {
		// if we get and addr in use error, clean up and try again
		if (e.code == 'EADDRINUSE') {
			console.log('Listen address in use, retrying...');
			this.server.close();
			setTimeout(() => {
				this.listen(); // restart the server
			}, 500);
		}
		this.emit('error', e);
	}

	closeHandler() {
		let path = this.conf.path;
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

		if (!socket.myident) {
			socket.myident = Symbol("socket-" + (++this.socketcount));
		}

		var messager = new Messager(Object.assign(this.conf, {log_prefix: 'messager_server:'}), socket);

		messager.on('message', (m) => {
			this.emit('message', m, messager);
		});
	}
}


module.exports = Server;



