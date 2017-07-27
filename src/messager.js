/*
 * Messager is an event emitter that basically wraps a TCP socket
 * and emits "message" events when a complete message is received
 * instead of the "data" and other socket events
 *
 * It also provides methods for sending an receiving messages on the socket
 *
 * Events:
 * connect - fired when the socket is connected to the other end
 *
 * close - fired when the socket becomes disconnected for any reason
 *
 * error - fired on a socket or protocol error
 *
 * message - fired when a complete message is received on the socket
 *
 * 
*/

const Promise = require('bluebird');
const EventEmitter = require('events');


const defaults = {
	// the maximum payload length we allow for this messager
	// the hard max that the protocol can handle is a 4byte unsigned int
	// making this value bigger than that will not work
	// smaller probably makes more sense in most cases
	max_payload: Math.pow(256, 4), 
	debug: false,
	log_prefix: 'Messager: ',
}



class Messager extends EventEmitter {

	constructor(conf, socket) {
		super();

		if (socket) {
			this.setSocket(socket);
		}

		conf = conf || {};
		['max_payload', 'keep_alive', 'debug', 'log_prefix'].forEach((n) => {
			this[n] = conf[n] || defaults[n];
		})
		this.conf = conf;

		// ascii control character we use for separating our header fields
		this.SEP_CODE = 30;
		this.SEP = String.fromCharCode(this.SEP_CODE);

		// data collectors to hold stream data and attribs
		this.resetCollectors();
	}

	log() {
		if (!this.debug) return;
		var args = Array.prototype.slice.call(arguments);
		args.unshift(this.log_prefix);
		console.log.apply(this, args);
	}

	setSocket(socket) {
		this.socket = socket;
		this.socket.on('close', e => { this.socketHandlerClose(e) });
		this.socket.on('data', b => { this.socketHandlerData(b) });
		//this.socket.on('drain', () => { this.socketHandlerDrain() });
		this.socket.on('connect', () => { this.socketHandlerConnect() });
		this.socket.on('end', () => { this.socketHandlerEnd() });
		this.socket.on('error', e => { this.socketHandlerError(e) });
		this.socket.on('timeout', () => { this.socketHandlerTimeout() });
		return socket;
	}

	close(e) {
		this.socket.end().unref().destroy(e);
	}

	// send a message, resolving then the message is fully sent
	async send(type, payload, encoding) {
		var msg = this.makeMessage(type, payload, encoding);

		return new Promise((resolve, reject) => {
			var errorListen;

			errorListen = (e) => {
				reject(e);
			}

			this.log("adding error listener");
			this.socket.once('error', errorListen);

			this.socket.write(msg, () => {
				this.log("date written for send, removing error listener");
				this.socket.removeListener('error', errorListen);
				resolve();
			});
		});
	}

	// send a message, resolving when we get a reply
	async sendWait(type, payload, encoding) {
		var msg = this.makeMessage(type, payload, encoding);

		return new Promise((resolve, reject) => {
			var mssgListen, errorListen;

			mssgListen = (m) => {
				this.log('message listener fired');
				resolve(m);
			}

			errorListen = (e) => {
				this.log("error fired, removing message listener");
				this.removeListener('message', mssgListen);
				reject(e);
			}

			this.log("adding message listener");
			this.once('message', mssgListen);

			this.log("adding error listener");
			this.socket.once('error', errorListen);

			this.socket.write(msg, () => {
				this.log("date written for message wait, removing error listener");
				this.socket.removeListener('error', errorListen);
			});
		});
	}


	makeMessage(type, payload, encoding) {
		// construct a protocol message
		var payload = Buffer.from(payload, encoding || 'utf8'); // message payload, default utf8
		var len4bytes = Buffer.from(this.toBytesInt32(payload.length), 'hex');
		var message = Buffer.from(type+this.SEP, 'ascii');
		var totalLength = message.length + len4bytes.length + payload.length;
		return Buffer.concat([message, len4bytes, payload], totalLength);
	}

	resetCollectors() {
		this.type = "";
		this.data = null;
		this.length = 0;
		this.header_sent = false;
		this.type_sent = false;
		this.lenbuf = new ArrayBuffer(4);
		this.lenview = new DataView(this.lenbuf);
		this.len_count = 0;
	}

	socketHandlerClose(e) {
		this.log('close');
		this.socket = null;
		this.emit('close', e);
	}

	socketHandlerConnect() {
		this.log('connect')
		this.emit('connect');
	}

	//socketHandlerDrain(e) {
	//	this.emit('error', e);
	//}

	socketHandlerEnd() {
		this.log('end')
		this.emit('close');
	}

	socketHandlerError(e) {
		this.log('error', e)
		this.emit('error', e);
	}

	socketHandlerTimeout() {
		this.log('timeout')
	}

	socketHandlerData(buf) {
		if (!this.header_sent) {
			buf = this.readHeader(buf);
		} 

		if (buf && this.header_sent) {
			this.readPayload(buf);
		}
	}

	readHeader(buf) {
		// buffer should contain some part of a header
		// read through the message header byte by bytle 
		// until we get to the end and set the length
		var i = 0;

		for (const b of buf) {

			if (!this.type_sent) {

				if (b === this.SEP_CODE) {
					this.type_sent = true;
				} else {
					this.type += String.fromCharCode(b);
				}

			} else if (this.len_count < 4) {

				this.lenview.setUint8(this.len_count, b, false);
				this.len_count++;

				if (this.len_count === 4) {

					this.header_sent = true;
					this.length = this.lenview.getUint32(0, false);

					// if length is greater than allowed, throw an error
					// and close/destroy this socket, everything is screwed at this point
					// we'd need to start the connection over to recover
					if (this.length > this.max_payload) {
						let e = new Error('Message payload exceeds max length ('+this.max_payload+'bytes)');
						e.code = 'PAYLOAD_OVERFLOW';
						this.socket.end().destroy(e);
						return false;
					}

					// strip the header off of the data buffer, we read it already
					buf = buf.slice(i + 1);

					return buf; // we have our header, end this loop and return the remaining buffer
				}

			}

			i++;
		}

		// if we are here, we got through the whole buffer, but didn't encounter the end of header
		// so just return false to stop processing from here. Future data events may have the 
		// remaining header data
		return false; 
	}


	readPayload(buf) {
		// we have a header, so this data is a message payload in whole or part,
		// for length bytes
		// but may have another message header after length bytes are read

		var bufnext;
		if (buf.length <= this.length) {
			this.length -= buf.length;
			this.data = concatBuffer(this.data, buf)
		} else {
			// slice the part of the buffer we need for the rest of this message
			this.data = concatBuffer(this.data, buf.slice(0, this.length));

			// slice off the remaining buffer so we can feed it back though the processor
			bufnext = buf.slice(this.length);

			this.length = 0;
			this.header_sent = false;
		}

		if (this.length === 0) {

			// our message is complete, emit it now
			this.emit('message', {
				type: this.type,
				data: this.data,
			}, this);

			// message is done, reset all our stream data
			this.resetCollectors();

			// if we have more data, then pass it back through the data handler
			if (Buffer.isBuffer(bufnext) && bufnext.length) {
				this.socketHandlerData(bufnext);
			}
		}
	}


	// convenience method to convert a 32-bit unsigned int to an array of 4 bytes
	toBytesInt32(num) {
		var arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
		var view = new DataView(arr);
		view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
		return arr;
	}

}


module.exports = Messager;



function concatBuffer(maybe_buf, buf) {
	if (Buffer.isBuffer(maybe_buf)) {
		return Buffer.concat([maybe_buf, buf], maybe_buf.length + buf.length)
	} else {
		return buf;
	}
}




