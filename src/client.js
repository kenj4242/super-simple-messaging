const Promise = require('bluebird');
const conf = require('super-simple-node-config')();
const net = require('net');
const EventEmitter = require('events');
const MessageHandler = require('./protocol');

class Client extends EventEmitter {

	constructor(conf) {
		super();
		this.conf = conf;
	}

	async connect() {
		var socket = new net.Socket();
		if (this.conf.keepAlive) {
			socket.setKeepAlive(true);
		}
		var messager = new MessageHandler(socket, conf.protocol);

		return new Promise((resolve, reject) => {
			socket.on('connect', () => {
				this.emit('connected');
				resolve(messager);
			})
			socket.once('error', (e) => {
				reject(e);
			});
			socket.connect(this.conf);
		});
	}

	async sendMessage(type, payload, encoding) {
		// connect on-demand
		var messager = await this.connect();
		var ret = await messager.sendWait(type, payload, encoding);
		messager.close();
		return ret;
	}

}


module.exports = Client;


