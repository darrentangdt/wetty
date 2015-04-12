var express = require('express');
var http = require('http');
var https = require('https');
var path = require('path');
var ws = require('websocket').server;
var pty = require('pty.js');
var fs = require('fs');
var waitpid = require('waitpid');

var opts = require('optimist')
    .options({
        sslkey: {
            demand: false,
            description: 'path to SSL key'
        },
        sslcert: {
            demand: false,
            description: 'path to SSL certificate'
        },
        sshhost: {
            demand: false,
            description: 'ssh server host'
        },
        sshport: {
            demand: false,
            description: 'ssh server port'
        },
        sshuser: {
            demand: false,
            description: 'ssh user'
        },
        sshauth: {
            demand: false,
            description: 'defaults to "password", you can use "publickey,password" instead'
        },
        docker: {
            demand: false,
            description: 'docker host to use with exec'
        },
        tlscacert: {
            demand: false,
            description: 'docker tls ca cert'
        },
        tlscert: {
            demand: false,
            description: 'docker tls cert'
        },
        tlskey: {
            demand: false,
            description: 'docker tls key'
        },
        container: {
            demand: false,
            description: 'docker container id to exec'
        },
        command: {
            demand: false,
            description: 'command to use with container exec'
        },
        port: {
            demand: true,
            alias: 'p',
            description: 'wetty listen port'
        },
    }).boolean('allow_discovery').argv;

var runhttps = false;
var sshport = 22;
var sshhost = 'localhost';
var sshauth = 'password';
var dockerhost = 'unix:///var/run/docker.sock';
var tlscacert = '';
var tlscert = '';
var tlskey = '';
var container = '';
var command = 'sh';
var globalsshuser = '';

if (opts.sshport) {
    sshport = opts.sshport;
}

if (opts.sshhost) {
    sshhost = opts.sshhost;
}

if (opts.sshauth) {
	sshauth = opts.sshauth
}

if (opts.sshuser) {
    globalsshuser = opts.sshuser;
}

if (opts.docker) {
    dockerhost = opts.docker;
}

if (opts.tlscacert) {
    tlscacert = opts.tlscacert;
}

if (opts.tlscert) {
    tlscert = opts.tlscert;
}

if (opts.tlskey) {
    tlskey = opts.tlskey;
}

if (opts.container) {
    container = opts.container;
}

if (opts.command) {
    command = opts.command;
}

if (opts.sslkey && opts.sslcert) {
    runhttps = true;
    opts['ssl'] = {};
    opts.ssl['key'] = fs.readFileSync(path.resolve(opts.sslkey));
    opts.ssl['cert'] = fs.readFileSync(path.resolve(opts.sslcert));
}

process.on('uncaughtException', function(e) {
    console.error('Error: ' + e);
});

var httpserv;

var app = express();
app.get('/wetty/ssh/:user', function(req, res) {
    res.sendfile(__dirname + '/public/wetty/index.html');
});
app.use('/', express.static(path.join(__dirname, 'public')));

if (runhttps) {
    httpserv = https.createServer(opts.ssl, app).listen(opts.port, function() {
        console.log('https on port ' + opts.port);
    });
} else {
    httpserv = http.createServer(app).listen(opts.port, function() {
        console.log('http on port ' + opts.port);
    });
}

var wss = new ws({
    httpServer: httpserv
});

wss.on('request', function(request) {
    var term;
    var sshuser = '';
    var conn = request.accept('wetty', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    if (request.resource.match('^/wetty/ssh/')) {
        sshuser = request.resource;
        sshuser = sshuser.replace('/wetty/ssh/', '');
    }
    conn.on('message', function(msg) {
        var data = JSON.parse(msg.utf8Data);
        if (!term) {
            var args = ['-H', dockerhost];
            if (tlscacert !== '') {
                args.push('--tlscacert', tlscacert, '--tlscert', tlscert, '--tlskey', tlskey, '--tlsverify')
            }
            args.push('exec', '-ti', container, command);
            term = pty.spawn('docker', args, {
                name: 'xterm-256color',
                cols: 80,
                rows: 30
            });
            console.log((new Date()) + " PID=" + term.pid + " STARTED on behalf of user=" + sshuser)
            term.on('data', function(data) {
                conn.send(JSON.stringify({
                    data: data
                }));
            });
            term.on('exit', function(code) {
                console.log((new Date()) + " PID=" + term.pid + " ENDED")
            })
        }
        if (!data)
            return;
        if (data.rowcol) {
            term.resize(data.col, data.row);
        } else if (data.data) {
            term.write(data.data);
        }
    });
    conn.on('error', function() {
        term.end();
    });
    conn.on('close', function() {
        term.end();
    })
})
