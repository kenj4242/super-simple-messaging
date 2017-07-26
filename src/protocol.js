const Promise = require('bluebird');
const EventEmitter = require('events');
const defaults = {
	MAX_PAYLOAD: Math.pow(256, 4), // absolute max that the protocol can handle is a 4byte unsigned int
}

class MessageHandler extends EventEmitter {

	constructor(socket, conf) {
		super();

		this.socket = socket;
		this.socket.on('error', e => { this.socketErrorHandler(e) });
		this.socket.on('end', () => { this.socketEndHandler() });
		this.socket.on('data', b => { this.handleProtocolData(b) });

		conf = conf || {};
		this.max_payload = conf.max_payload || defaults.MAX_PAYLOAD;

		// ascii control character we use for separating our header fields
		this.SEP_CODE = 30;
		this.SEP = String.fromCharCode(this.SEP_CODE);

		// data collectors to hold stream data and attribs
		this.resetCollectors();
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

	handleProtocolData(buf) {
		var _this = this;

		this.data = concatBuffer(this.data, buf);

		if (!this.header_sent) {
			// data should contain a header, either partial or complete
			// read through the message header until we get to the end and set the length
			var i = 0;

			for (const b of this.data) {

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
							this.socket.end().unref().destroy(e);
							return false;
						}

						// strip the header off of the data buffer, we read it already
						buf = this.data.slice(i + 1);
						this.data = null;

						break; // we have our header, end the per-byte loop
					}

				}

				i++;
			}
		} 

		if (this.header_sent) {
			// we have a header, so this data is a message payload for length bytes
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
				this.header_sent = false;
				this.type_sent = false;
				// our message is complete, emit it now

				var bb = _this.emit('message', {
					type: this.type,
					data: this.data,
				}, this);

				// message is done, reset all our stream data
				this.resetCollectors();

				// if we have more data then feed it back through to process
				if (Buffer.isBuffer(bufnext) && bufnext.length) {
					this.handleProtocolData(bufnext);
				}
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

	close(e) {
		this.socket.end().unref().destroy(e);
	}

	// send a message, resolving then the message is fully sent
	async send(type, payload, encoding) {
		return this.sendBase(type, payload, encoding, false);
	}

	// send a message, resolving when we get a reply
	async sendWait(type, payload, encoding) {
		return this.sendBase(type, payload, encoding, true);
	}

	async sendBase(type, payload, encoding, waitForMessage) {
		var _this = this;

		var msg = this.makeMessage(type, payload, encoding);

		return new Promise(function(resolve, reject) {

			if (waitForMessage) {
				_this.once('message', m => { resolve(m) });
			} else {
				_this.socket.once('drain', () => { resolve() });
			}

			_this.socket.once('error', (e) => { reject(e) });
			_this.socket.write(msg);
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

	socketErrorHandler(e) {
		this.socket.end().unref().destroy();
		this.emit('error', e);
	}

	socketEndHandler() {
		//console.log('Server socket recvd end from client');
		this.socket.end().unref().destroy();
	}
}


module.exports = MessageHandler;



function concatBuffer(maybe_buf, buf) {
	if (Buffer.isBuffer(maybe_buf)) {
		return Buffer.concat([maybe_buf, buf], maybe_buf.length + buf.length)
	} else {
		return buf;
	}
}



