/**
 * Expression evaluator
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var tok = require('./token');
	var parser = require('./parser');

	var ops1 = {
		'-': function(a) {
			a = a.clone();
			a.value *= -1;
			return a;
		}
	};

	var ops2 = {
		'+':  operation(function(a, b) {return a + b;}),
		'-':  operation(function(a, b) {return a - b;}),
		'*':  operation(function(a, b) {return a * b;}),
		'/':  operation(function(a, b) {return a / b;}),
		'=':  comparison(function(a, b) {return a == b;}),
		'==': comparison(function(a, b) {return a == b;}),
		'<':  comparison(function(a, b) {return a < b;}),
		'>':  comparison(function(a, b) {return a > b;}),
		'<=': comparison(function(a, b) {return a <= b;}),
		'>=': comparison(function(a, b) {return a <= b;}),
		'!=': comparison(function(a, b) {return a != b;}),
		',':  function(a, b) {throw new Error('Not implemented');}
	};

	function operation(fn) {
		return function(a, b) {
			var c = b.clone();
			c.value = fn(a ? a.value : 0, b.value);
			return c;
		};
	}

	function comparison(fn) {
		return function(a, b) {
			return tok.bool(fn(a.value, b.value));
		}
	}

	function getOperation(token, context, fallback) {
		var op = token.value;
		return (context && context.get(op)) || fallback[op];
	}

	return module.exports = function(expr, context) {
		if (!Array.isArray(expr)) {
			expr = parser.parse(expr);
		}

		var nstack = [];
		var n1, n2, f;
		var item, value;

		for (var i = 0, il = expr.length; i < il; i++) {
			item = expr[i];
			if (item.is(tok.number)) {
				nstack.push(item);
			} else if (item.is(tok.op2)) {
				n2 = nstack.pop();
				n1 = nstack.pop();
				f = getOperation(item, context, ops2);
				nstack.push(f(n1, n2));
			} else if (item.is(tok.variable)) {
				// TODO implement
				value = context.get(token.value);
				if (!value) {
					throw new Error('Undefined variable: ' + item.value);
				}
				nstack.push(value);
			} else if (item.is(tok.op1)) {
				n1 = nstack.pop();
				f = ops1[item.value];
				nstack.push(f(n1));
			} else if (item.is(tok.fn)) {
				// TODO implement
				n1 = nstack.pop();
				n2 = nstack.pop();
				f = context.get(n2.value);
				if (f.apply && f.call) {
					value = runFn(f, n1);
					if (value === null) {
						throw new Error('Function "' + n2.value + '" returned null');
					}
					nstack.push(value);
				} else {
					throw new Error('Function "' + n2.value + '" doesn’t exists');
				}
			} else {
				throw new Error("Invalid expression");
			}
		}

		if (nstack.length > 1) {
			throw new Error("invalid Expression (parity)");
		}

		return nstack[0];
	};
});