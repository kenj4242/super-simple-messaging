const Promise = require('bluebird');
const net = require('net');
//const EventEmitter = require('events');
const Messager = require('./messager');

class Client {

	constructor(conf) {
		this.conf = conf;
		this.messager = new Messager(Object.assign(conf, {log_prefix: "messager_client:"}));

		this.reqQ = [];
	}

	async connect(forceNew) {
		if (!forceNew && this.socket && !this.socket.destroyed) {
			// assume the current socket is still good,
			// no way we can know otherwise I guess...
			return this.socket;
		}

		// create a new socket for this client
		return new Promise((resolve, reject) => {
			this.socket = new net.Socket();
			if (this.keep_alive) {
				this.socket.setKeepAlive(true);
			}
			this.messager.setSocket(this.socket);

			this.socket.once('connect', () => {
				resolve(this.socket)
			});
			this.socket.once('error', (e) => {
				reject(e)
			});
			this.socket.connect(this.conf);
		});
	}

	async request(type, payload, encoding) {
		await this.connect();
		return this.messager.sendWait(type, payload, encoding);
	}

}

module.exports = Client;


