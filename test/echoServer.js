const conf = require('super-simple-node-config')();
const ssms = require('../dist/server.js');

const ssmServer = new ssms(Object.assign(conf, {debug: false, log_prefix: "messager_server"}));

ssmServer.on('listening', function(server) {
	console.log('EchoServer listening on '+server.address());
});

ssmServer.on('error', e => {
	console.log('EchoServer Error:', e.message);
});

// when we get a massage, echo it back with some added text to type and data
ssmServer.on('message', async (m, messager) => {
	//console.log('server got a message on ', messager.socket.myident, ':', m.type, m.data.toString("utf8"));
	return messager.send(m.type+'-reply', '>'+m.data.toString("utf8")+"|");
});

ssmServer.listen();



