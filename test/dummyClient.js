const Promise = require('bluebird');
const conf = require('super-simple-node-config')();
const expect = require('chai').expect;
const randomstring = require("randomstring");
const ssmc = require('../dist/client.js');

console.log(JSON.stringify(Object.assign({}, conf, {log_prefix: 'messager_client'+process.pid}), null, 2));
var ssmClient = new ssmc(Object.assign({}, conf, {log_prefix: 'messager_client'+process.pid}));


(async function() {

	await new Promise((res, rej) => {

		print('READY');

		setTimeout(() => { console.log('FAIL TIMEOUT'); res() }, 5000);

		// start test1 when we get a SIGUSR1
		process.on('SIGPIPE', async function() {
			if (await doTest1()) {
				print('SUCCESS');
			} else {
				print('FAIL');
			}
			return false;
		});

	});

})();


function print(msg) {
	return console.log(msg);
}


async function doTest1() {
	var payload, x, ps = [], payload_bytes = 0;

	for(x = 0; x < 30; x++) {
		payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
		payload_bytes += payload.length;
		ps.push(checkEchoMessage('test'+x, payload));
	}

	// make sure we get at least one zero length message in this middle here
	payload = "";
	ps.push(checkEchoMessage('test', payload));

	for(; x < 60; x++) {
		payload = randomstring.generate({ length: getRandomIntInclusive(0, 4096) });
		payload_bytes += payload.length;
		ps.push(checkEchoMessage('test'+x, payload));
	}

	console.log(payload_bytes+' bytes sent');

	try {
		await Promise.all(ps);
		return true;
	} catch(e) {
		return false;
	}

}


async function checkEchoMessage(type, mssg) {
	var response = await ssmClient.request(type, mssg);

	expect(response).to.be.an('object');
	expect(response.type).to.equal(type+"-reply");

	var data = response.data.toString('utf8');
	expect(data).to.equal(">"+mssg+"|");

	console.log('client got a response', (response.type == type+"-reply"), (data == ">"+mssg+"|"));

	return true;
}


function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min; // The maximum is inclusive and the minimum is inclusive 
}



