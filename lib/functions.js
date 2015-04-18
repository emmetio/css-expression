/**
 * Functions implementations used in LESS expressions.
 * It’s a slightly modified version of original LESS implementation:
 * https://github.com/less/less.js/blob/master/lib/less/functions.js
 * 
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var tok = require('./token');
	var colors = require('./color');
	var split = require('./split');

	var defaultUnits = {
		length: 'm',
		duration: 's',
		angle: 'rad'
	};

	var unitConversions = {
		// length
		length: {
			'm':  1,
			'cm': 0.01,
			'mm': 0.001,
			'in': 0.0254,
			'pt': 0.0254 / 72,
			'pc': 0.0254 / 72 * 12
		},

		// duration
		duration: {
			's':  1,
			'ms': 0.001
		},
		
		// angle
		angle: {
			'rad':  1 / (2 * Math.PI),
			'deg':  1 / 360,
			'grad': 1 / 400,
			'turn': 1
		}
	};

	function clamp(val) {
		return Math.min(1, Math.max(0, val));
	}

	function dimension(value, unit) {
		if (arguments.length == 1 && typeof value == 'object' && 'type' in value) {
			unit = value.unit;
			value = value.value;
		}

		var out = tok.number(value);
		out.unit = unit || '';
		return out;
    }

	function unitCoeff(unit) {
		var g = unitGroup(unit);
		return g ? g[unit] : void 0;
	}

	function unitGroupName(unit) {
		for (var p in unitConversions) if (unitConversions.hasOwnProperty(p)) {
			if (unit in unitConversions[p]) {
				return p;
			}
		}
	}

	function unitGroup(unit) {
		return unitConversions[unitGroupName(unit)];
	}

	function convertTo(value, from, to) {
		if (!from) {
			// no original unit, pick default one from group
			var g = unitGroupName(to);
			from = g ? defaultUnits[g] : '';
		}

		if (!from || !to) {
			return {
				value: value,
				unit: from
			};
		}

		return {
			value: value * unitCoeff(from) / unitCoeff(to),
			unit: to
		};
	}

	function toArray(obj, ix) {
		return Array.prototype.slice.call(obj, ix || 0);
	}

	var mathFunctions = {
		// name,  unit
		ceil:  null, 
		floor: null, 
		sqrt:  null, 
		abs:   null,
		tan:   "", 
		sin:   "", 
		cos:   "",
		atan:  "rad", 
		asin:  "rad", 
		acos:  "rad"
	};

	function _math(fn, unit, n) {
		var result;
		if (unit === null) {
			unit = n.unit;
		} else if (unit === '' || unit === 'rad') {
			// convert degrees to radians, if required
			if (n.unit !== 'rad') {
				n.value = convertTo(n.value, n.unit, 'rad').value;
				n.unit = 'rad';
			}

			result = convertTo(fn(parseFloat(n.value)), n.unit, unit || 'rad');
			result.unit = unit;
		}

		if (!result) {
			result = {
				value: fn(parseFloat(n.value)),
				unit: unit
			};
		}

		return dimension(result.value, result.unit);
	}

	function hsla(color) {
		return module.exports.hsla(color.h, color.s, color.l, color.a);
	}

	function scaled(n, size) {
		if (n.unit == '%') {
			return parseFloat(n.value * size / 100);
		} else {
			return number(n);
		}
	}

	function number(n) {
		if (typeof n === 'number') {
			return n;
		} else {
			return parseFloat(n.unit == '%' ? n.value / 100 : n.value);
		}

		throw new Error('color functions take numbers as parameters');
	}

	function rgb(r, g, b, a) {
		return {r: r, g: g, b: b, a: typeof a == 'undefined' ? 1 : a};
	}

	function toColor(token) {
		if (token.is(tok.color)) {
			return token.value;
		}

		if (token.is(tok.variable)) {
			// maybe a color keyword?
			var value = colors(token.value, true);
			if (value) {
				return value;
			}
		}

		throw new Error('Invalid color token: ' + token.value + ' (' + token.type + ')');
	}

	module.exports = {
		rgb: function (r, g, b) {
			return module.exports.rgba(r, g, b, 1);
		},
		rgba: function (r, g, b, a) {
			var rgba = [r, g, b].map(function (c) {
				return scaled(c, 255);
			});
			rgba.push(number(a || 1));

			return tok.color(rgba);
		},
		hsl: function (h, s, l) {
			return module.exports.hsla(h, s, l, 1);
		},
		hsla: function (h, s, l, a) {
			h = (number(h) % 360) / 360;
			s = clamp(number(s));
			l = clamp(number(l));
			a = clamp(number(a));

			var m2 = l <= 0.5 ? l * (s + 1) : l + s - l * s;
			var m1 = l * 2 - m2;

			var hue = function(h) {
				h = h < 0 ? h + 1 : (h > 1 ? h - 1 : h);
				if      (h * 6 < 1) { return m1 + (m2 - m1) * h * 6; }
				else if (h * 2 < 1) { return m2; }
				else if (h * 3 < 2) { return m1 + (m2 - m1) * (2/3 - h) * 6; }
				else                { return m1; }
			};

			return module.exports.rgba(
				hue(h + 1/3) * 255,
				hue(h)       * 255,
				hue(h - 1/3) * 255,
				a
			);
		},

		hsv: function(h, s, v) {
			return module.exports.hsva(h, s, v, 1.0);
		},

		hsva: function(h, s, v, a) {
			h = ((number(h) % 360) / 360) * 360;
			s = number(s); 
			v = number(v); 

			var i, f;
			i = Math.floor((h / 60) % 6);
			f = (h / 60) - i;

			var vs = [v,
				v * (1 - s),
				v * (1 - f * s),
				v * (1 - (1 - f) * s)];
			var perm = [[0, 3, 1],
				[2, 0, 1],
				[1, 0, 3],
				[1, 2, 0],
				[3, 1, 0],
				[0, 1, 2]];

			return module.exports.rgba(
				vs[perm[i][0]] * 255,
				vs[perm[i][1]] * 255,
				vs[perm[i][2]] * 255,
				a
			);
		},

		hue: function(color) {
			var hsl = toColor(color).toHSL();
			return dimension(Math.round(hsl.h));
		},
		saturation: function(color) {
			var hsl = toColor(color).toHSL();
			return dimension(Math.round(hsl.s * 100), '%');
		},
		lightness: function(color) {
			var hsl = toColor(color).toHSL();
			return dimension(Math.round(hsl.l * 100), '%');
		},
		hsvhue: function(color) {
			var hsv = toColor(color).toHSV();
			return dimension(Math.round(hsv.h));
		},
		hsvsaturation: function(color) {
			var hsv = toColor(color).toHSV();
			return dimension(Math.round(hsv.s * 100), '%');
		},
		hsvvalue: function(color) {
			var hsv = toColor(color).toHSV();
			return dimension(Math.round(hsv.v * 100), '%');
		},
		red: function(color) {
			return dimension(Math.round(toColor(color).r));
		},
		green: function(color) {
			return dimension(Math.round(toColor(color).g));
		},
		blue: function(color) {
			return dimension(Math.round(toColor(color).b));
		},
		alpha: function(color) {
			return dimension(toColor(color).a);
		},
		luma: function(color) {
			color = toColor(color);
			var luma = color.luma();
			return dimension(Math.round(luma * color.a * 100), '%');
		},
		saturate: function(color, amount) {
			// filter: saturate(3.2);
			// should be kept as is, so check for color
			if (color.is(tok.number)) {
				return null;
			}

			var hsl = toColor(color).toHSL();
			hsl.s = clamp(hsl.s + number(amount));
			return hsla(hsl);
		},
		desaturate: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.s = clamp(hsl.s - number(amount));
			return hsla(hsl);
		},
		lighten: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.l = clamp(hsl.l + number(amount));
			return hsla(hsl);
		},
		darken: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.l = clamp(hsl.l - number(amount));
			return hsla(hsl);
		},
		fadein: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.a = clamp(hsl.a + number(amount));
			return hsla(hsl);
		},
		fadeout: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.a = clamp(hsl.a - number(amount));
			return hsla(hsl);
		},
		fade: function(color, amount) {
			var hsl = toColor(color).toHSL();
			hsl.a = clamp(number(amount));
			return hsla(hsl);
		},
		spin: function(color, amount) {
			var hsl = toColor(color).toHSL();
			var hue = (hsl.h + number(amount)) % 360;
			hsl.h = hue < 0 ? 360 + hue : hue;
			return hsla(hsl);
		},
		//
		// Copyright (c) 2006-2009 Hampton Catlin, Nathan Weizenbaum, and Chris Eppstein
		// http://sass-lang.com
		//
		mix: function(color1, color2, weight) {
			weight = weight || tok.number(0.5);

			color1 = toColor(color1);
			color2 = toColor(color2);

			var p = number(weight);
			var w = p * 2 - 1;
			var a = color1.a - color2.a;

			var w1 = (((w * a == -1) ? w : (w + a) / (1 + w * a)) + 1) / 2.0;
			var w2 = 1 - w1;

			var rgb = [color1.r * w1 + color2.r * w2,
				color1.g * w1 + color2.g * w2,
				color1.b * w1 + color2.b * w2];

			return module.exports.rgba(rgb[0], rgb[1], rgb[2], a);
		},
		greyscale: function(color) {
			return module.exports.desaturate(color, tok.number(1));
		},
		contrast: function(color, dark, light, threshold) {
			// filter: contrast(3.2);
			// should be kept as is, so check for color
			if (color.is(tok.number)) {
				return null;
			}

			color = toColor(color);
			light = toColor(light || tok.color(255, 255, 255, 1));
			dark = toColor(dark || tok.color(0, 0, 0, 1));
			
			//Figure out which is actually light and dark!
			if (dark.luma() > light.luma()) {
				var t = light;
				light = dark;
				dark = t;
			}
			if (typeof threshold === 'undefined') {
				threshold = 0.43;
			} else {
				threshold = number(threshold);
			}
			if (color.luma() < threshold) {
				return module.exports.rgba(light.r, light.g, light.b, light.a);
			} else {
				return module.exports.rgba(dark.r, dark.g, dark.b, dark.a);
			}
		},
		e: function(str) {
			return tok.string(str.value);
		},
		escape: function (str) {
			return encodeURI(str.value).replace(/=/g, "%3D").replace(/:/g, "%3A").replace(/#/g, "%23").replace(/;/g, "%3B").replace(/\(/g, "%28").replace(/\)/g, "%29");
		},
		'%': function (quoted) {
			var args = Array.prototype.slice.call(arguments, 1),
			str = quoted.value;

			for (var i = 0, value; i < args.length; i++) {
				value = args[i].valueOf();
				/* jshint ignore:start */
				str = str.replace(/%[sda]/i, function(token) {
					return token.match(/[A-Z]$/) ? encodeURIComponent(value) : value;
				});
				/* jshint ignore:end */
			}
			var out = tok.string(str.replace(/%%/g, '%'));
			out.quote = quoted.quote;
			return out;
		},
		unit: function(val, unit) {
			return dimension(val.value, unit ? unit.value : '');
		},
		convert: function(val, unit) {
			var result = convertTo(val.value, val.unit, unit.value);
			return dimension(result.value, result.unit);
		},
		round: function(n, f) {
			var fraction = typeof(f) === "undefined" ? 0 : f.value;
			return _math(function(num) {
				return num.toFixed(fraction);
			}, null, n);
		},
		pi: function() {
			return Math.PI;
		},
		mod: function(a, b) {
			return dimension(a.value % b.value, a.unit || b.unit);
		},
		pow: function(x, y) {
			return dimension(Math.pow(x.value, y.value), x.unit);
		},
		_minmax: function(isMin, args) {
			args = Array.prototype.slice.call(args);

			switch(args.length) {
				case 0: throw new Error('one or more arguments required');
				case 1: return dimension(args[0]);
			}

			// unify all values first: transform them to a single unit
			// also collect all unit group names to validate action
			var groups = {};
			var order = args.map(function(a) {
				var value = a;
				if (a.is(tok.string)) {
					groups.string = 1;
				} else if (a.is(tok.number)) {
					groups.number = 1;
				} else {
					var groupName = unitGroupName(a.unit);
					if (groupName) {
						groups[groupName] = 1;
						value = convertTo(a.value, a.unit, defaultUnits[groupName]).value;
					} else {
						groups[a.type] = 1;
						value = a.value;
					}
				}

				return {
					value: value,
					ref: a
				};
			});

			if (Object.keys(groups).length > 1) {
				// can’t compare distinct groups, tell evaluator 
				// to leave expression as is
				return null;
			}

			order.sort(function(a, b) {
				return isMin ? a.value - b.value : b.value - a.value;
			});

			return dimension(order[0].ref);
		},
		min: function() {
			return module.exports._minmax(true, arguments);
		},
		max: function() {
			return module.exports._minmax(false, arguments);
		},
		argb: function(color) {
			return color.value.toARGB();
		},
		percentage: function(n) {
			return dimension(n.value * 100, '%');
		},
		color: function(n) {
			if (n.is(tok.color)) {
				return n;
			}

			if (n.is(tok.string)) {
				var returnColor = colors(n.value, true);
				if (returnColor) {
					return tok.color(returnColor);
				}
				throw new Error('argument must be a color keyword or 3/6 digit hex e.g. #FFF');
			} else {
				throw new Error('argument must be a string');
			}
		},
		iscolor: function(n) {
			return n.is(tok.color) || !!colors(n.value, true);
		},
		isnumber: function(n) {
			return n && n.is(tok.number);
		},
		isstring: function(n) {
			return n && n.is(tok.string);
		},
		iskeyword: function(n) {
			return module.exports.isstring(n);
		},
		isurl: function(n) {
			return module.exports.isstring(n);
		},
		ispixel: function(n) {
			return module.exports.isunit(n, 'px');
		},
		ispercentage: function(n) {
			return module.exports.isunit(n, '%');
		},
		isem: function(n) {
			return module.exports.isunit(n, 'em');
		},
		isunit: function (n, unit) {
			return n.unit == unit.value || n.unit == unit;
		},
		tint: function(color, amount) {
			return module.exports.mix(tok.color('#fff'), color, amount);
		},
		shade: function(color, amount) {
			return module.exports.mix(tok.color('#000'), color, amount);
		},
		extract: function() {
			var args = Array.prototype.slice.call(arguments, 0);
			var index = args.pop().value - 1;  // (1-based index)
			var values;

			if (args.length == 1 && args[0].is(tok.string)) {
				values = split(args[0].value);
			} else {
				values = args.map(function(a) {
					return a.value;
				});
			}

			// handle non-array values as an array of length 1
			// return 'undefined' if index is invalid
			return Array.isArray(values) 
				? values[index] : Array(values)[index];
		},
		length: function(values) {
			var args = arguments;
			if (args.length == 1 && values.is(tok.string)) {
				args = split(values.value);
			}
			return dimension(args.length);
		},

		"data-uri": function(mimetypeNode, filePathNode) {
			throw new Error('Not implemented');
		},

		// string functions
		
		unquote: function(string) {
			var result = tok.string(string.value);
			result.quote = '';
			return result;
		},

		quote: function(string) {
			var result = tok.string(string.value);
			result.quote = '"';
			return result;
		},

		"str-length": function(string) {
			return tok.number(string.value.length)
		},

		"str-insert": function(string, insert, index) {
			var result = string.clone();
			string = string.toPrimitive();
			insert = insert.toPrimitive();
			index = Math.min(index.toPrimitive(), string.length);
			result.value = string.substring(0, index) + insert + string.substring(index);
			return result;
		},

		"str-index": function(string, substring) {
			return tok.number(string.toPrimitive().indexOf(substring.toPrimitive()));
		},

		"str-slice": function(string, start, end) {
			var result = string.clone();
			string = string.toPrimitive();
			result.value = string.substring(start.toPrimitive(), end ? end.toPrimitive() : string.length);
			return result;
		},

		"to-upper-case": function(string) {
			var result = string.clone();
			result.value = result.value.toUpperCase();
			return result;
		},

		"to-lower-case": function(string) {
			var result = string.clone();
			result.value = result.value.toLowerCase();
			return result;
		},

		// SASS functions
		nth: function(list, n) {
			// a workaround for feature/bug when list gets spreaded
			// across arguments
			var args = toArray(arguments);
			n = args.pop().toPrimitive();
			if (list) {
				if (list.is(tok.list)) {
					list = list.value;
				} else {
					list = args;
				}
			}

			// in SASS, index is 1-based
			return list[n > 0 ? n - 1 : list.length + n];
		}
	};

	// math
	for (var f in mathFunctions) {
		module.exports[f] = _math.bind(null, Math[f], mathFunctions[f]);
	}

	// color blending
	Object.keys(colors.blendMode).forEach(function(mode) {
		module.exports[mode] = function(a, b) {
			return tok.color(a.blend(b, mode));
		};
	});

	return module.exports;
});