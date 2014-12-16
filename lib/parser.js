/**
 * Expression parser and tokenizer
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var stringStream = require('string-stream');
	var tok = require('./token');

	var ops1 = ['-'];
	var ops2 = ['+', '-', '*', '/', ',', '=', '==', '<', '<=', '>', '>=', '!='];
	var nullary = tok.number(0);
	var reVar = /^[@\$]?[\w\-_]*/i;
	var reNum = /^(-?[\d\.]+)([a-z%]+)?/;
	var reHexColor = /^#[a-f0-9]+/i;
	var reQuote = /['"]/;

	var PRIMARY      = 1 << 0;
	var OPERATOR     = 1 << 1;
	var FUNCTION     = 1 << 2;
	var LPAREN       = 1 << 3;
	var RPAREN       = 1 << 4;
	var COMMA        = 1 << 5;
	var SIGN         = 1 << 6;
	var CALL         = 1 << 7;
	var NULLARY_CALL = 1 << 8;

	function addFunc(operator, state) {
		var ops = state.operators;
		operator.priority += state.priority;
		while (ops.length > 0) {
			if (operator.priority <= ops[ops.length - 1].priority) {
				state.tokens.push(ops.pop());
			} else {
				break;
			}
		}
		ops.push(operator);
	}

	function error(name, stream) {
		if (stream) {
			name += ' at character ' + stream.start + ' in expression ' + stream.string;
		}
		throw new Error(name);
	}

	function isSign(token) {
		return isPositiveSign(token) || isNegativeSign(token);
	}

	function isPositiveSign(token) {
		return token.value === '+';
	}

	function isNegativeSign(token) {
		return token.value === '-';
	}

	function isOperator(stream) {
		var ch = stream.next();

		switch (ch) {
			case '+':
				return tok.op2(stream, 1);
			
			case '-':
				// this is a tricky one: might be a dash before vendor-prefixed
				// property: -webkit-transform
				if (!/[a-z]/i.test(stream.peek())) {
					return tok.op2(stream, 1);
				}
				break;
			
			case '|':
				if (stream.peek() === '|') {
					stream.next();
					return tok.op2(stream, 1);
				}
				break;
			
			case '*':
			// case '%':
				return tok.op2(stream, 2);
			
			case '/':
			// case '^':
				return tok.op2(stream, 3);

			case '=':
				// handle some weird cases in LESS: =< instead of <=
				if (/[=<>]/.test(stream.peek())) {
					stream.next();
				}
				return tok.op2(stream);

			case '!':
			case '<':
			case '>':
				if (stream.peek() === '=') {
					stream.next();
				}
				return tok.op2(stream);
		}

		stream.backUp(1);
		return false;
	}

	function isComment(stream) {
		if (stream.next() === '/' && stream.peek() === '*') {
			stream.next();
			if (stream.skipTo('*/')) {
				stream.pos += 2;
				return true;
			}

			stream.backUp(1);
			error('Unterminated comment', stream);
		}

		stream.backUp(1);
		return false;
	}

	function isWhite(stream) {
		return stream.eatSpace();
	}

	function isNumber(stream) {
		if (stream.match(reNum, true)) {
			return tok.number(stream);
		} 

		return false;
	}

	function isString(stream) {
		var ch = stream.next();

		// A LESS-specific syntax: ~"foo", returns unquoted string
		if (ch === '~' && reQuote.test(stream.peek())) {
			if (stream.skipQuoted(true)) {
				return tok.string(stream.current().slice(2, -1));
			}
			error('Unterminated string escaper', stream);
		}

		if (reQuote.test(ch)) {
			if (stream.skipString(ch)) {
				return tok.string(stream);
			}

			error('Unterminated string', stream);
		}

		stream.backUp(1);
		return false;
	}

	function isColor(stream) {
		if (stream.peek() !== '#') {
			return false;
		}

		var m = stream.match(reHexColor, true);
		if (!m || (m[0].length !== 4 && m[0].length !== 7)) {
			return false;
		}

		return tok.color(stream);
	}

	function isLeftParenth(stream, state) {
		if (stream.peek() === '(') {
			stream.next();
			state.priority += 10;
			return tok(stream, -2);
		}

		return false;
	}

	function isRightParenth(stream, state) {
		if (stream.peek() === ')') {
			stream.next();
			state.priority -= 10;
			return true;
		}
		
		return false;
	}

	function isComma(stream) {
		if (stream.next() === ',') {
			return tok.op2(stream, -1);
		}
		
		stream.backUp(1);
		return false;
	}

	/**
	 * Check if current character points `minus` operator.
	 * The `-` operator is pretty tricky in CSS expressions:
	 * it can also be a part of function or variable
	 * @param  {StringStream}  stream
	 * @return {Boolean}
	 */
	function isMinusOperator(stream) {
		if (stream.peek() !== '-') {
			return false;
		}

		var next = stream.string.charAt(stream.pos + 1);
		return !/^[a-z_]/i.test(next);
	}

	function isOp(stream, ops) {
		var lookup = ops.join('');
		var op = '', ch;
		while (!stream.eol()) {
			ch = stream.peek();
			if (~lookup.indexOf(ch)) {
				if (ch === '-' && !isMinusOperator(stream)) {
					break;
				}
				op += stream.next();
			} else {
				break;
			}
		}

		if (op && ~ops.indexOf(op)) {
			return tok(stream, 5);
		}

		stream.backUp(op.length);
		return false;
	}

	function isOp1(stream) {
		return isOp(stream, ops1);
	}

	function isOp2(stream) {
		return isOp(stream, ops2);
	}

	function isVar(stream) {
		// var ch = stream.peek();
		// if ((ch === '@' || ch === '$') && stream.match(reVar, true)) {
		// 	return tok.variable(stream, 4);
		// }
		if (stream.match(reVar, true)) {
			return tok.variable(stream, 4);
		}

		return false;
	}

	function addToList(token, state) {
		var last = state.tokens[state.tokens.length - 1];
		if (!last) {
			return false;
		}

		if (!last.is(tok.tokenlist)) {
			last = tok.tokenlist([last]);
			state.tokens[state.tokens.length - 1] = last;
		}

		last.value.push(token);
		return true;
	}

	return {
		nullary: nullary,
		parse: function(expr) {
			if (!expr) {
				return [];
			}
			
			expr = expr.trim();
			var stream = stringStream(expr);
			var token;
			var noperators = 0;
			var expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
			var state = {
				stream: stream,
				tokens: [],
				operators: [],
				priority: 0
			};

			while (!stream.eol()) {
				stream.start = stream.pos;

				if (isComment(stream) || isWhite(stream)) {
					continue;
				}

				if (token = isColor(stream)) {
					if ((expected & PRIMARY) === 0) {
						addToList(token, state);
						// error('Unexpected color', stream);
					} else {
						state.tokens.push(token);
					}

					expected = (OPERATOR | RPAREN | COMMA);
				} else if (token = isNumber(stream)) {
					if ((expected & PRIMARY) === 0) {
						addToList(token, state);
						// error('Unexpected number', stream);
					} else {
						state.tokens.push(token);
					}

					expected = (OPERATOR | RPAREN | COMMA);
				} else if (token = isOperator(stream)) {
					if (isSign(token) && (expected & SIGN)) {
						if (isNegativeSign(token)) {
							noperators++;
							addFunc(tok.op1(token, 2), state);
						}
						expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
					} else if (!isComment(stream)) {
						if ((expected & OPERATOR) === 0) {
							error('Unexpected operator', stream);
						}
						noperators += 2;
						addFunc(token, state);
						expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
					}
				} else if (token = isString(stream)) {
					if ((expected & PRIMARY) === 0) {
						addToList(token, state);
						// error('Unexpected string', stream);
					} else {
						state.tokens.push(token);
					}

					expected = (OPERATOR | RPAREN | COMMA);
				} else if (token = isLeftParenth(stream, state)) {
					if ((expected & LPAREN) === 0) {
						error('Unexpected "("', stream);
					}

					if (expected & CALL) {
						noperators += 2;
						addFunc(tok.fn(token), state);
					}

					expected = (PRIMARY | LPAREN | FUNCTION | SIGN | NULLARY_CALL);
				} else if (isRightParenth(stream, state)) {
					if (expected & NULLARY_CALL) {
						state.tokens.push(nullary);
					} else if ((expected & RPAREN) === 0) {
						error('Unexpected ")"', state);
					}

					expected = (OPERATOR | RPAREN | COMMA | LPAREN | CALL);
				} else if (token = isComma(stream)) {
					if ((expected & COMMA) === 0) {
						error('Unexpected ","', stream);
					}
					addFunc(token, state);
					noperators += 2;
					expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
				} else if (token = isOp2(stream)) {
					if ((expected & FUNCTION) === 0) {
						error('Unexpected function', stream);
					}
					addFunc(token, state);
					noperators += 2;
					expected = (LPAREN);
				} else if (token = isOp1(stream)) {
					if ((expected & FUNCTION) === 0) {
						error('Unexpected function', stream);
					}
					
					addFunc(token, state);
					noperators++;
					expected = (LPAREN);
				} else if (token = isVar(stream)) {
					if ((expected & PRIMARY) === 0) {
						addToList(token, state);
						// error('Unexpected variable', stream);
					} else {
						state.tokens.push(token);
					}
					expected = (OPERATOR | RPAREN | COMMA | LPAREN | CALL);
				} else {
					error('Unknown character', stream);
				}
			}

			if (state.priority < 0 || state.priority >= 10) {
				error('Unmatched "()"', stream);
			}
			
			state.tokens = state.tokens.concat(state.operators.reverse());

			// console.log(state.tokens);
			
			if (noperators + 1 !== state.tokens.length) {
				error('Parity', stream);
			}

			state.tokens.expression = expr;
			return state.tokens;
		}
	};
});