const Promise = require('bluebird');
const MessagerPool = require('./messager-pool');

class Client {

	constructor(conf) {
		this.conf = conf;
		this.pool = new MessagerPool(conf);
	}

	async connect(forceNew) {

		//var socket = await this.pool.getMessager(this.conf);
		//return socket;

		/*
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
		*/
	}

	async request(type, payload, encoding) {
		var messager = await this.pool.getMessager(Object.assign({}, this.conf, {log_prefix: "messager_client:"}));

		var reply = await messager.sendWait(type, payload, encoding);
		
		this.pool.free(messager);
		
		return reply;
	}

}

module.exports = Client;


