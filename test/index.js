const Promise = require('bluebird');
const conf = require('super-simple-node-config')();
const expect = require('chai').expect;
const randomstring = require("randomstring");
const { spawn } = require('child_process');
const ssmc = require('../dist/client.js');

describe('Server/Client Tests', function() {

	var echoServer;
	var ssmClient = new ssmc(conf.listen);

	before('spawn an echo server in a seperate process', async function() {
		echoServer = await spawn('node', ['test/echoServer.js']);
		echoServer.on('error', (e) => {
			console.log("EchoServer spawn error:", e);
		});

		echoServer.stdout.on('data', (data) => {
			console.log(`EchoServer <>: ${data}`);
		});

		echoServer.stderr.on('data', (data) => {
			console.log(`EchoServer <2>: ${data}`);
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

		it('should send a lot of variable-length messages, and get proper replies for all', async function() {
			this.timeout(200000);

			/*
			for(let i = 0; i < 50; i++) {
				var payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				await checkEchoMessage('test', payload);
			}
			
			var payload = "";
			await checkEchoMessage('test', payload);

			for(let i = 0; i < 50; i++) {
				var payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
				await checkEchoMessage('test', payload);
			}
			*/
			var ps = [];

			for(let x = 0; x < 100; x++) {
				console.log(x+'.');
				for(let i = 0; i < 100; i++) {
					var payload = randomstring.generate({ length: getRandomIntInclusive(0, 196) });
					ps.push(checkEchoMessage('test'+x+'-'+i, payload));
					console.log("  "+i+'.');
				}
				await Promise.all(ps);
				Promise.delay(1);
			}
		});

	});


	async function checkEchoMessage(type, mssg) {
		var response = await ssmClient.sendMessage(type, mssg);

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
  return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive 
}


