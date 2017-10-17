const Promise = require('bluebird');
const net = require('net');
const Messager = require('./messager');

const defaults = {
	max_count: 5,
	min_count: 1,
	linger_time: 2000,
};

class SocketPool {

	constructor(conf) {
		this.conf = Object.assign({}, defaults, conf || {});
		this.pool = [];
		this.reqQ = [];
	}

	async getMessager(mconf) {
		var s, i, len;
		for(i = 0, len = this.pool.length; i < len; i++) {
			s = this.pool[i];

			if (!s.busy) {
				this.log('returning a recycled socket');
				return this.makeBusy(s);
			}
		}

		// no socket available, see if we can add a new one
		if (this.pool.length < this.conf.max_count) {
			var socket = new net.Socket();
			socket.setKeepAlive(true);

			var messager = new Messager(this.conf, socket);
			messager.busy = true;

			messager.on('close', (had_error) => {
				this.removeSocket(socket);
			});

			this.pool.push(messager);
			this.log('returning a NEW socket');

			return new Promise((resolve, reject) => {
				socket.once('connect', () => {
					resolve(messager)
				});
				socket.connect(this.conf);
			})
		}

		// no socket available, can't add a new one, 
		// so aadd our resolvers to the request queue
		// to be resolved when one comes free
		return new Promise((resolve, reject) => {
			this.log('queueing up for the next available socket');
			this.reqQ.push({resolve: resolve, reject: reject});
		})
	}

	free(messager) {
		this.log('freeing a socket');
		var s, i, len;
		for(i = 0, len = this.pool.length; i < len; i++) {
			s = this.pool[i];
			if (s === messager) {
				s.busy = false;
				break;
			}
		}

		// since we've now got a free socket, give it to the request queue
		this.fullfillRequestQueue(s);
	}

	removeSocket(rms) {
		this.log('removing a socket');
		var s, i, len;
		for(i = 0, len = this.pool.length; i < len; i++) {
			s = this.pool[i];
			if (s.socket === rms) {
				this.pool.splice(i, 1);
				break;
			}
		}
	}

	fullfillRequestQueue(s) {

		if (this.reqQ.length) {

			this.log('fullfilling a request queue with a freed socket');
			var rq = this.reqQ.shift();
			s = this.makeBusy(s);
			rq.resolve(s);

		} else {

			// there's no pending queue, so see if this socket should be culled
			if (this.pool.length > this.conf.min_count) {
				// set us up for destruction after linger time expires
				s.killer = setTimeout(() => {
					if (!s.busy) {
						s.socket.end().unref();
						this.removeSocket(s.socket);
					}
				}, this.conf.linger_time);
			}

		}

	}

	makeBusy(so) {
		so.busy = true;
		if (so.killer) {
			clearTimeout(so.killer);
			so.killer = null;
		}
		return so;
	}

	log() {
		if (!this.debug) return;
		var args = Array.prototype.slice.call(arguments);
		args.unshift('--> ');
		console.log.apply(this, args);
	}
}


module.exports = SocketPool;


