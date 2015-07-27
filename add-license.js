#!/usr/bin/env node

/*
 * Copyright (c) 2015, Gary Guo
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 *  * Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR AND CONTRIBUTORS ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE AUTHOR OR CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
 * DAMAGE.
 */

var argv = parseArg(process.argv.slice(2));
var fs = require('fs');
var path = require('path');

function parseArg(args) {
	var ret = {
		_: []
	};
	for (var i = 0; i < args.length; i++) {
		var argItem = args[i];
		if (argItem[0] == '-') {
			if (argItem[1] == '-') {
				argItem = argItem.substring(1);
			}
			var pair = argItem.substring(1);
			var eq = pair.indexOf('=');
			if (eq == -1) {
				ret[pair] = '';
			} else {
				ret[pair.substring(0, eq)] = pair.substring(eq + 1);
			}
		} else {
			ret._.push(argItem);
		}
	}
	return ret;
}

function error(msg) {
	console.log(msg);
	process.exit(1);
}

function loadFile(file) {
	return fs.readFileSync(file).toString();
}

function replacePlaceholder(text, year, owner, orag) {
	return text.replace(/%YEAR%/g, year).replace(/%OWNER%/g, owner).replace(/%ORAGNIZATION%/g, orag);
}

function limitColumn(text, column) {
	return text.split("\n").map(function(line) {
		if (line.length <= column) {
			return line;
		}

		// Find length of prefix
		var ident = line.search(/[a-z]/i);

		// Cannot proceed
		if (ident < 0 || ident >= column) {
			return line;
		}

		// Seperate prefix and create ident string
		var prefix = line.substring(0, ident);
		var identText = Array(ident + 1).join(' ');

		var ret = prefix;
		var lineRest = column - ident;
		var tokens = line.substring(ident).split(' ');

		while (tokens.length) {
			var tok = tokens.shift();
			if (tok.length + 1 > lineRest) {
				ret += '\n' + identText + tok + ' ';
				lineRest = column - ident - tok.length - 1;
			} else {
				ret += tok + ' ';
				lineRest -= tok.length + 1;
			}
		}
		return ret;
	}).join('\n').replace(/ +\n/g, '\n');
}

function processFile(licenseText, file) {
	if (typeof(licenseText) == "function") {
		licenseText = licenseText(file);
	}
	if (!licenseText) {
		return;
	}
	fs.readFile(file, function(err, data) {
		if (err)
			throw err;
		var content = data.toString();
		if (content.search(/copyright/i) != -1) {
			console.log('It seems that ' + file + ' already has a copyright declaration');
			return;
		}
		if (content.substring(0, 2) == '#!') {
			var firstLineBreak = content.indexOf('\n') + 1 || content.length;
			content = content.substring(0, firstLineBreak) + '\n' + licenseText + '\n\n' + content.substring(firstLineBreak);
		} else {
			content = licenseText + '\n\n' + content;
		}
		fs.writeFile(file, content);
		console.log('Add license to ' + file);
	});
}

if (!argv.author) {
	error('Expected --author');
}

var license = argv.license || 'bsd2';
var year = argv.year || '' + new Date().getFullYear();
var owner = argv.author;
var orag = argv.oragnization || owner;
var column = argv.column || 80;
var licenseText = limitColumn(replacePlaceholder(loadFile(__dirname + '/license/' + license + '.txt'), year, owner, orag), column - 4);

var type = argv.type || 'auto';

var processer = {
	c: function(licenseText) {
		return '/*\n' + licenseText.split("\n").map(function(line) {
			return ' * ' + line;
		}).join("\n") + '\n */';
	},
	'c++': function(licenseText) {
		return processer.c(licenseText);
	},
	js: function(licenseText) {
		return processer.c(licenseText);
	},
	bash: function(licenseText) {
		return licenseText.split("\n").map(function(line) {
			return '# ' + line;
		}).join("\n");
	},
	makefile: function(licenseText) {
		return processer.bash(licenseText);
	},
	auto: function(licenseText) {
		return function(filename) {
			if (filename == 'LICENSE') {
				return licenseText;
			} else if (filename == 'Makefile') {
				return processer.makefile(licenseText);
			}
			var extname = path.extname(filename);
			switch (extname) {
				case '.sh':
					return processer.bash(licenseText);
				case '.c':
				case '.h':
					return processer.c(licenseText);
				case '.cc':
				case '.cpp':
				case '.cxx':
				case '.c++':
				case '.C':
				case '.hh':
				case '.hpp':
				case '.hxx':
				case '.h++':
				case '.H':
					return processer['c++'](licenseText);
				case '.js':
					return processer.js(licenseText);
				default:
					console.log('Unrecognized extension name ' + extname);
					return null;
			}
		}
	}
}

if (processer[type]) {
	licenseText = processer[type](licenseText);
} else {
	error('Unknown --type=' + type);
}

if (argv.preview !== undefined) {
	console.log(typeof licenseText == 'function' ? licenseText('LICENSE') : licenseText);
	process.exit(0);
}

for (var i = 0; i < argv._.length; i++) {
	processFile(licenseText, argv._[i]);
}