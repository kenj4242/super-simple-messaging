const Promise = require('bluebird');
const conf = require('super-simple-node-config')();
const expect = require('chai').expect;
const randomstring = require("randomstring");
const { spawn } = require('child_process');
const ssmc = require('../dist/client.js');

describe('Server/Client Tests', function() {
	this.slow(0); // show time for everything

	var echoServer;
	var ssmClient = new ssmc(Object.assign({}, conf, {log_prefix: 'messager_client'}));

	before('spawn an echo server in a seperate process', async function() {
		echoServer = await spawn('node', ['test/echoServer.js']);
		echoServer.on('error', (e) => {
			console.log("EchoServer spawn error:", e);
		});

		echoServer.stdout.on('data', (data) => {
			console.log(`ESo:${data}`);
		});

		echoServer.stderr.on('data', (data) => {
			console.log(`ESe: ${data}`);
		});

		return new Promise(function(resolve, reject) {
			echoServer.stdout.on('data', (data) => {
				// wait till we know the echo server is listening
				if (/^EchoServer listening on/.test(data)) {
					resolve('listening');
				}
			});
		});
	});

	after('destroy the echo server', async function() {
		echoServer.kill();
	});

	describe('Client Connection', function() {

		it('should send a message and get a reply', async function() {
			await checkEchoMessage('test', 'fake payload');
		});

		it('should send a large message and get a reply', async function() {
			var payload = randomstring.generate({ length: 4096 });
			payload = payload.repeat(10);
			await checkEchoMessage('test', payload);
		});

		it('should send a message with a zero-length payload, and get a reply', async function() {
			var payload = "";
			await checkEchoMessage('test', payload);
		});

		it('should send 200 random, variable-length messages in sequence, and get proper replies for all', async function() {
			this.timeout(5000);
			var payload, x;

			for(x = 0; x < 100; x++) {
				payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				await checkEchoMessage('test'+x, payload);
			}

			// make sure we get at least one zero length message in this middle here
			payload = "";
			await checkEchoMessage('test', payload);

			for(x = 101; x < 200; x++) {
				payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				await checkEchoMessage('test'+x, payload);
			}

		});

		it('should send 200 random, variable-length messages in parellel, and get proper replies for all', async function() {
			this.timeout(5000);
			var payload, x, ps = [], payload_bytes = 0;

			for(x = 0; x < 100; x++) {
				payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				payload_bytes += payload.length;
				ps.push(checkEchoMessage('test'+x, payload));
			}

			// make sure we get at least one zero length message in this middle here
			payload = "";
			ps.push(checkEchoMessage('test', payload));

			for(x = 101; x < 200; x++) {
				payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				payload_bytes += payload.length;
				ps.push(checkEchoMessage('test'+x, payload));
			}

			await Promise.all(ps);

			//console.log(payload_bytes+' bytes sent');

		});

	});

	describe('Multi Client Connection', function() {
		var procs = [];

		before('spawn 5 clients in seperate processes', async function() {
			var ps = [];

			for(let i = 0; i < 5; i++) {
				let proc = await spawn('node', ['test/dummyClient.js']);
				proc.on('error', (e) => {
					console.log("DummyClient spawn error:", e);
				});

				//proc.stdout.on('data', (data) => {
				//	data = (""+data).trim();
				//	console.log(`DC${i}o: ${data}`);
				//});

				//proc.stderr.on('data', (data) => {
				//	data = (""+data).trim();
				//	console.log(`DC${i}e: ${data}`);
				//});

				// listen for our outputs on stdout for this process
				ps.push(new Promise(function(resolve, reject) {
					proc.stdout.on('data', (data) => {
						(""+data).split(/[\r\n]/).forEach((d) => {
							if (/^READY$/.test(d)) {
								resolve(true);
							}
						});
					});
				}));

				procs.push(proc);
			}

			return Promise.all(ps);
		});

		after('destroy the dummy clients', async function() {
			for(var i = 0; i < 4; i++) {
				procs[i].kill();
			}
		});


		it('should send messages from many clients and get correct replies', async function() {
			this.timeout(8000);

			var ps = [];

			for(let i = 0; i < 5; i++) {
				let proc = procs[i];

				ps.push(
					new Promise(function(resolve, reject) {
						// monitor progress for success
						proc.stdout.on('data', (data) => {
							data = data+"";

							(""+data).split(/[\r\n]/).forEach((d) => {
								d = d.trim();
								if (/^SUCCESS$/.test(d)) {
									resolve(true);
								}
								if (/^FAIL$/.test(d)) {
									reject(new Error('Client test error'));
								}
							})
						})
					})
				);

				proc.kill('SIGPIPE'); // signal to start sending messages
			}

			var results;
			try {
				results = await Promise.all(ps);
				expect(results).to.be.an('array');
				for(let v of results) {
					expect(v).to.be.true;
				}
			} catch (e) {
				expect.fail();
			}

		});

	});



	async function checkEchoMessage(type, mssg) {
		var response = await ssmClient.request(type, mssg);

		var data = response.data.toString('utf8');

		//console.log('client got a response', response.type, data.substr(0, 30)+' ... ');

		expect(response).to.be.an('object');
		expect(response.type).to.equal(type+"-reply");
		expect(data).to.equal(">"+mssg+"|");

		return data;
	}

});



function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min; // The maximum is inclusive and the minimum is inclusive 
}


