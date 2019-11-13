define([
    "dojo/_base/declare", "mxui/widget/_WidgetBase", "dijit/_TemplatedMixin",
    "dojo/_base/lang",
    "./utils",
    // "LoginSnake/lib/jquery-1.11.2",
    //"LoginSnake/lib/anime",
    //"LoginSnake/lib/anime.min",
    "dojo/text!FireWorkAnime/widget/template/FireWorkAnime.html"
], function (declare, _WidgetBase, _TemplatedMixin, lang, utils, /*_jQuery,*/ widgetTemplate) {
    "use strict";
    // var $ = _jQuery.noConflict(true);
    return declare("FireWorkAnime.widget.FireWorkAnime", [_WidgetBase, _TemplatedMixin], {
        // _TemplatedMixin will create our dom node using this HTML template.
        templateString: widgetTemplate,
        // DOM elements
        canvas: null,
        // Parameters configured in the Modeler.
        messageString: "",
        // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
        _handles: null,
        _contextObj: null,

        // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
        constructor: function () {
            this._handles = [];
        },

        // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
        postCreate: function () {

            var defaultInstanceSettings = {
                update: null,
                begin: null,
                loopBegin: null,
                changeBegin: null,
                change: null,
                changeComplete: null,
                loopComplete: null,
                complete: null,
                loop: 1,
                direction: 'normal',
                autoplay: true,
                timelineOffset: 0
              };
              
              var defaultTweenSettings = {
                duration: 1000,
                delay: 0,
                endDelay: 0,
                easing: 'easeOutElastic(1, .5)',
                round: 0
              };
              
              var validTransforms = ['translateX', 'translateY', 'translateZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'scale', 'scaleX', 'scaleY', 'scaleZ', 'skew', 'skewX', 'skewY', 'perspective'];
              
              // Caching
              
              var cache = {
                CSS: {},
                springs: {}
              };
              
              // Utils
              
              function minMax(val, min, max) {
                return Math.min(Math.max(val, min), max);
              }
              
              function stringContains(str, text) {
                return str.indexOf(text) > -1;
              }
              
              function applyArguments(func, args) {
                return func.apply(null, args);
              }
              
              var is = {
                arr: function (a) { return Array.isArray(a); },
                obj: function (a) { return stringContains(Object.prototype.toString.call(a), 'Object'); },
                pth: function (a) { return is.obj(a) && a.hasOwnProperty('totalLength'); },
                svg: function (a) { return a instanceof SVGElement; },
                inp: function (a) { return a instanceof HTMLInputElement; },
                dom: function (a) { return a.nodeType || is.svg(a); },
                str: function (a) { return typeof a === 'string'; },
                fnc: function (a) { return typeof a === 'function'; },
                und: function (a) { return typeof a === 'undefined'; },
                hex: function (a) { return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a); },
                rgb: function (a) { return /^rgb/.test(a); },
                hsl: function (a) { return /^hsl/.test(a); },
                col: function (a) { return (is.hex(a) || is.rgb(a) || is.hsl(a)); },
                key: function (a) { return !defaultInstanceSettings.hasOwnProperty(a) && !defaultTweenSettings.hasOwnProperty(a) && a !== 'targets' && a !== 'keyframes'; }
              };
              
              // Easings
              
              function parseEasingParameters(string) {
                var match = /\(([^)]+)\)/.exec(string);
                return match ? match[1].split(',').map(function (p) { return parseFloat(p); }) : [];
              }
              
              // Spring solver inspired by Webkit Copyright © 2016 Apple Inc. All rights reserved. https://webkit.org/demos/spring/spring.js
              
              function spring(string, duration) {
              
                var params = parseEasingParameters(string);
                var mass = minMax(is.und(params[0]) ? 1 : params[0], .1, 100);
                var stiffness = minMax(is.und(params[1]) ? 100 : params[1], .1, 100);
                var damping = minMax(is.und(params[2]) ? 10 : params[2], .1, 100);
                var velocity =  minMax(is.und(params[3]) ? 0 : params[3], .1, 100);
                var w0 = Math.sqrt(stiffness / mass);
                var zeta = damping / (2 * Math.sqrt(stiffness * mass));
                var wd = zeta < 1 ? w0 * Math.sqrt(1 - zeta * zeta) : 0;
                var a = 1;
                var b = zeta < 1 ? (zeta * w0 + -velocity) / wd : -velocity + w0;
              
                function solver(t) {
                  var progress = duration ? (duration * t) / 1000 : t;
                  if (zeta < 1) {
                    progress = Math.exp(-progress * zeta * w0) * (a * Math.cos(wd * progress) + b * Math.sin(wd * progress));
                  } else {
                    progress = (a + b * progress) * Math.exp(-progress * w0);
                  }
                  if (t === 0 || t === 1) { return t; }
                  return 1 - progress;
                }
              
                function getDuration() {
                  var cached = cache.springs[string];
                  if (cached) { return cached; }
                  var frame = 1/6;
                  var elapsed = 0;
                  var rest = 0;
                  while(true) {
                    elapsed += frame;
                    if (solver(elapsed) === 1) {
                      rest++;
                      if (rest >= 16) { break; }
                    } else {
                      rest = 0;
                    }
                  }
                  var duration = elapsed * frame * 1000;
                  cache.springs[string] = duration;
                  return duration;
                }
              
                return duration ? solver : getDuration;
              
              }
              
              // Basic steps easing implementation https://developer.mozilla.org/fr/docs/Web/CSS/transition-timing-function
              
              function steps(steps) {
                if ( steps === void 0 ) steps = 10;
              
                return function (t) { return Math.round(t * steps) * (1 / steps); };
              }
              
              // BezierEasing https://github.com/gre/bezier-easing
              
              var bezier = (function () {
              
                var kSplineTableSize = 11;
                var kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);
              
                function A(aA1, aA2) { return 1.0 - 3.0 * aA2 + 3.0 * aA1 }
                function B(aA1, aA2) { return 3.0 * aA2 - 6.0 * aA1 }
                function C(aA1)      { return 3.0 * aA1 }
              
                function calcBezier(aT, aA1, aA2) { return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT }
                function getSlope(aT, aA1, aA2) { return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1) }
              
                function binarySubdivide(aX, aA, aB, mX1, mX2) {
                  var currentX, currentT, i = 0;
                  do {
                    currentT = aA + (aB - aA) / 2.0;
                    currentX = calcBezier(currentT, mX1, mX2) - aX;
                    if (currentX > 0.0) { aB = currentT; } else { aA = currentT; }
                  } while (Math.abs(currentX) > 0.0000001 && ++i < 10);
                  return currentT;
                }
              
                function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
                  for (var i = 0; i < 4; ++i) {
                    var currentSlope = getSlope(aGuessT, mX1, mX2);
                    if (currentSlope === 0.0) { return aGuessT; }
                    var currentX = calcBezier(aGuessT, mX1, mX2) - aX;
                    aGuessT -= currentX / currentSlope;
                  }
                  return aGuessT;
                }
              
                function bezier(mX1, mY1, mX2, mY2) {
              
                  if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) { return; }
                  var sampleValues = new Float32Array(kSplineTableSize);
              
                  if (mX1 !== mY1 || mX2 !== mY2) {
                    for (var i = 0; i < kSplineTableSize; ++i) {
                      sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2);
                    }
                  }
              
                  function getTForX(aX) {
              
                    var intervalStart = 0;
                    var currentSample = 1;
                    var lastSample = kSplineTableSize - 1;
              
                    for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
                      intervalStart += kSampleStepSize;
                    }
              
                    --currentSample;
              
                    var dist = (aX - sampleValues[currentSample]) / (sampleValues[currentSample + 1] - sampleValues[currentSample]);
                    var guessForT = intervalStart + dist * kSampleStepSize;
                    var initialSlope = getSlope(guessForT, mX1, mX2);
              
                    if (initialSlope >= 0.001) {
                      return newtonRaphsonIterate(aX, guessForT, mX1, mX2);
                    } else if (initialSlope === 0.0) {
                      return guessForT;
                    } else {
                      return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2);
                    }
              
                  }
              
                  return function (x) {
                    if (mX1 === mY1 && mX2 === mY2) { return x; }
                    if (x === 0 || x === 1) { return x; }
                    return calcBezier(getTForX(x), mY1, mY2);
                  }
              
                }
              
                return bezier;
              
              })();
              
              var penner = (function () {
              
                // Based on jQuery UI's implemenation of easing equations from Robert Penner (http://www.robertpenner.com/easing)
              
                var eases = { linear: function () { return function (t) { return t; }; } };
              
                var functionEasings = {
                  Sine: function () { return function (t) { return 1 - Math.cos(t * Math.PI / 2); }; },
                  Circ: function () { return function (t) { return 1 - Math.sqrt(1 - t * t); }; },
                  Back: function () { return function (t) { return t * t * (3 * t - 2); }; },
                  Bounce: function () { return function (t) {
                    var pow2, b = 4;
                    while (t < (( pow2 = Math.pow(2, --b)) - 1) / 11) {}
                    return 1 / Math.pow(4, 3 - b) - 7.5625 * Math.pow(( pow2 * 3 - 2 ) / 22 - t, 2)
                  }; },
                  Elastic: function (amplitude, period) {
                    if ( amplitude === void 0 ) amplitude = 1;
                    if ( period === void 0 ) period = .5;
              
                    var a = minMax(amplitude, 1, 10);
                    var p = minMax(period, .1, 2);
                    return function (t) {
                      return (t === 0 || t === 1) ? t : 
                        -a * Math.pow(2, 10 * (t - 1)) * Math.sin((((t - 1) - (p / (Math.PI * 2) * Math.asin(1 / a))) * (Math.PI * 2)) / p);
                    }
                  }
                };
              
                var baseEasings = ['Quad', 'Cubic', 'Quart', 'Quint', 'Expo'];
              
                baseEasings.forEach(function (name, i) {
                  functionEasings[name] = function () { return function (t) { return Math.pow(t, i + 2); }; };
                });
              
                Object.keys(functionEasings).forEach(function (name) {
                  var easeIn = functionEasings[name];
                  eases['easeIn' + name] = easeIn;
                  eases['easeOut' + name] = function (a, b) { return function (t) { return 1 - easeIn(a, b)(1 - t); }; };
                  eases['easeInOut' + name] = function (a, b) { return function (t) { return t < 0.5 ? easeIn(a, b)(t * 2) / 2 : 
                    1 - easeIn(a, b)(t * -2 + 2) / 2; }; };
                });
              
                return eases;
              
              })();
              
              function parseEasings(easing, duration) {
                if (is.fnc(easing)) { return easing; }
                var name = easing.split('(')[0];
                var ease = penner[name];
                var args = parseEasingParameters(easing);
                switch (name) {
                  case 'spring' : return spring(easing, duration);
                  case 'cubicBezier' : return applyArguments(bezier, args);
                  case 'steps' : return applyArguments(steps, args);
                  default : return applyArguments(ease, args);
                }
              }
              
              // Strings
              
              function selectString(str) {
                try {
                  var nodes = document.querySelectorAll(str);
                  return nodes;
                } catch(e) {
                  return;
                }
              }
              
              // Arrays
              
              function filterArray(arr, callback) {
                var len = arr.length;
                var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
                var result = [];
                for (var i = 0; i < len; i++) {
                  if (i in arr) {
                    var val = arr[i];
                    if (callback.call(thisArg, val, i, arr)) {
                      result.push(val);
                    }
                  }
                }
                return result;
              }
              
              function flattenArray(arr) {
                return arr.reduce(function (a, b) { return a.concat(is.arr(b) ? flattenArray(b) : b); }, []);
              }
              
              function toArray(o) {
                if (is.arr(o)) { return o; }
                if (is.str(o)) { o = selectString(o) || o; }
                if (o instanceof NodeList || o instanceof HTMLCollection) { return [].slice.call(o); }
                return [o];
              }
              
              function arrayContains(arr, val) {
                return arr.some(function (a) { return a === val; });
              }
              
              // Objects
              
              function cloneObject(o) {
                var clone = {};
                for (var p in o) { clone[p] = o[p]; }
                return clone;
              }
              
              function replaceObjectProps(o1, o2) {
                var o = cloneObject(o1);
                for (var p in o1) { o[p] = o2.hasOwnProperty(p) ? o2[p] : o1[p]; }
                return o;
              }
              
              function mergeObjects(o1, o2) {
                var o = cloneObject(o1);
                for (var p in o2) { o[p] = is.und(o1[p]) ? o2[p] : o1[p]; }
                return o;
              }
              
              // Colors
              
              function rgbToRgba(rgbValue) {
                var rgb = /rgb\((\d+,\s*[\d]+,\s*[\d]+)\)/g.exec(rgbValue);
                return rgb ? ("rgba(" + (rgb[1]) + ",1)") : rgbValue;
              }
              
              function hexToRgba(hexValue) {
                var rgx = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
                var hex = hexValue.replace(rgx, function (m, r, g, b) { return r + r + g + g + b + b; } );
                var rgb = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                var r = parseInt(rgb[1], 16);
                var g = parseInt(rgb[2], 16);
                var b = parseInt(rgb[3], 16);
                return ("rgba(" + r + "," + g + "," + b + ",1)");
              }
              
              function hslToRgba(hslValue) {
                var hsl = /hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(hslValue) || /hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/g.exec(hslValue);
                var h = parseInt(hsl[1], 10) / 360;
                var s = parseInt(hsl[2], 10) / 100;
                var l = parseInt(hsl[3], 10) / 100;
                var a = hsl[4] || 1;
                function hue2rgb(p, q, t) {
                  if (t < 0) { t += 1; }
                  if (t > 1) { t -= 1; }
                  if (t < 1/6) { return p + (q - p) * 6 * t; }
                  if (t < 1/2) { return q; }
                  if (t < 2/3) { return p + (q - p) * (2/3 - t) * 6; }
                  return p;
                }
                var r, g, b;
                if (s == 0) {
                  r = g = b = l;
                } else {
                  var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                  var p = 2 * l - q;
                  r = hue2rgb(p, q, h + 1/3);
                  g = hue2rgb(p, q, h);
                  b = hue2rgb(p, q, h - 1/3);
                }
                return ("rgba(" + (r * 255) + "," + (g * 255) + "," + (b * 255) + "," + a + ")");
              }
              
              function colorToRgb(val) {
                if (is.rgb(val)) { return rgbToRgba(val); }
                if (is.hex(val)) { return hexToRgba(val); }
                if (is.hsl(val)) { return hslToRgba(val); }
              }
              
              // Units
              
              function getUnit(val) {
                var split = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(%|px|pt|em|rem|in|cm|mm|ex|ch|pc|vw|vh|vmin|vmax|deg|rad|turn)?$/.exec(val);
                if (split) { return split[1]; }
              }
              
              function getTransformUnit(propName) {
                if (stringContains(propName, 'translate') || propName === 'perspective') { return 'px'; }
                if (stringContains(propName, 'rotate') || stringContains(propName, 'skew')) { return 'deg'; }
              }
              
              // Values
              
              function getFunctionValue(val, animatable) {
                if (!is.fnc(val)) { return val; }
                return val(animatable.target, animatable.id, animatable.total);
              }
              
              function getAttribute(el, prop) {
                return el.getAttribute(prop);
              }
              
              function convertPxToUnit(el, value, unit) {
                var valueUnit = getUnit(value);
                if (arrayContains([unit, 'deg', 'rad', 'turn'], valueUnit)) { return value; }
                var cached = cache.CSS[value + unit];
                if (!is.und(cached)) { return cached; }
                var baseline = 100;
                var tempEl = document.createElement(el.tagName);
                var parentEl = (el.parentNode && (el.parentNode !== document)) ? el.parentNode : document.body;
                parentEl.appendChild(tempEl);
                tempEl.style.position = 'absolute';
                tempEl.style.width = baseline + unit;
                var factor = baseline / tempEl.offsetWidth;
                parentEl.removeChild(tempEl);
                var convertedUnit = factor * parseFloat(value);
                cache.CSS[value + unit] = convertedUnit;
                return convertedUnit;
              }
              
              function getCSSValue(el, prop, unit) {
                if (prop in el.style) {
                  var uppercasePropName = prop.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
                  var value = el.style[prop] || getComputedStyle(el).getPropertyValue(uppercasePropName) || '0';
                  return unit ? convertPxToUnit(el, value, unit) : value;
                }
              }
              
              function getAnimationType(el, prop) {
                if (is.dom(el) && !is.inp(el) && (getAttribute(el, prop) || (is.svg(el) && el[prop]))) { return 'attribute'; }
                if (is.dom(el) && arrayContains(validTransforms, prop)) { return 'transform'; }
                if (is.dom(el) && (prop !== 'transform' && getCSSValue(el, prop))) { return 'css'; }
                if (el[prop] != null) { return 'object'; }
              }
              
              function getElementTransforms(el) {
                if (!is.dom(el)) { return; }
                var str = el.style.transform || '';
                var reg  = /(\w+)\(([^)]*)\)/g;
                var transforms = new Map();
                var m; while (m = reg.exec(str)) { transforms.set(m[1], m[2]); }
                return transforms;
              }
              
              function getTransformValue(el, propName, animatable, unit) {
                var defaultVal = stringContains(propName, 'scale') ? 1 : 0 + getTransformUnit(propName);
                var value = getElementTransforms(el).get(propName) || defaultVal;
                if (animatable) {
                  animatable.transforms.list.set(propName, value);
                  animatable.transforms['last'] = propName;
                }
                return unit ? convertPxToUnit(el, value, unit) : value;
              }
              
              function getOriginalTargetValue(target, propName, unit, animatable) {
                switch (getAnimationType(target, propName)) {
                  case 'transform': return getTransformValue(target, propName, animatable, unit);
                  case 'css': return getCSSValue(target, propName, unit);
                  case 'attribute': return getAttribute(target, propName);
                  default: return target[propName] || 0;
                }
              }
              
              function getRelativeValue(to, from) {
                var operator = /^(\*=|\+=|-=)/.exec(to);
                if (!operator) { return to; }
                var u = getUnit(to) || 0;
                var x = parseFloat(from);
                var y = parseFloat(to.replace(operator[0], ''));
                switch (operator[0][0]) {
                  case '+': return x + y + u;
                  case '-': return x - y + u;
                  case '*': return x * y + u;
                }
              }
              
              function validateValue(val, unit) {
                if (is.col(val)) { return colorToRgb(val); }
                if (/\s/g.test(val)) { return val; }
                var originalUnit = getUnit(val);
                var unitLess = originalUnit ? val.substr(0, val.length - originalUnit.length) : val;
                if (unit) { return unitLess + unit; }
                return unitLess;
              }
              
              // getTotalLength() equivalent for circle, rect, polyline, polygon and line shapes
              // adapted from https://gist.github.com/SebLambla/3e0550c496c236709744
              
              function getDistance(p1, p2) {
                return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
              }
              
              function getCircleLength(el) {
                return Math.PI * 2 * getAttribute(el, 'r');
              }
              
              function getRectLength(el) {
                return (getAttribute(el, 'width') * 2) + (getAttribute(el, 'height') * 2);
              }
              
              function getLineLength(el) {
                return getDistance(
                  {x: getAttribute(el, 'x1'), y: getAttribute(el, 'y1')}, 
                  {x: getAttribute(el, 'x2'), y: getAttribute(el, 'y2')}
                );
              }
              
              function getPolylineLength(el) {
                var points = el.points;
                var totalLength = 0;
                var previousPos;
                for (var i = 0 ; i < points.numberOfItems; i++) {
                  var currentPos = points.getItem(i);
                  if (i > 0) { totalLength += getDistance(previousPos, currentPos); }
                  previousPos = currentPos;
                }
                return totalLength;
              }
              
              function getPolygonLength(el) {
                var points = el.points;
                return getPolylineLength(el) + getDistance(points.getItem(points.numberOfItems - 1), points.getItem(0));
              }
              
              // Path animation
              
              function getTotalLength(el) {
                if (el.getTotalLength) { return el.getTotalLength(); }
                switch(el.tagName.toLowerCase()) {
                  case 'circle': return getCircleLength(el);
                  case 'rect': return getRectLength(el);
                  case 'line': return getLineLength(el);
                  case 'polyline': return getPolylineLength(el);
                  case 'polygon': return getPolygonLength(el);
                }
              }
              
              function setDashoffset(el) {
                var pathLength = getTotalLength(el);
                el.setAttribute('stroke-dasharray', pathLength);
                return pathLength;
              }
              
              // Motion path
              
              function getParentSvgEl(el) {
                var parentEl = el.parentNode;
                while (is.svg(parentEl)) {
                  if (!is.svg(parentEl.parentNode)) { break; }
                  parentEl = parentEl.parentNode;
                }
                return parentEl;
              }
              
              function getParentSvg(pathEl, svgData) {
                var svg = svgData || {};
                var parentSvgEl = svg.el || getParentSvgEl(pathEl);
                var rect = parentSvgEl.getBoundingClientRect();
                var viewBoxAttr = getAttribute(parentSvgEl, 'viewBox');
                var width = rect.width;
                var height = rect.height;
                var viewBox = svg.viewBox || (viewBoxAttr ? viewBoxAttr.split(' ') : [0, 0, width, height]);
                return {
                  el: parentSvgEl,
                  viewBox: viewBox,
                  x: viewBox[0] / 1,
                  y: viewBox[1] / 1,
                  w: width / viewBox[2],
                  h: height / viewBox[3]
                }
              }
              
              function getPath(path, percent) {
                var pathEl = is.str(path) ? selectString(path)[0] : path;
                var p = percent || 100;
                return function(property) {
                  return {
                    property: property,
                    el: pathEl,
                    svg: getParentSvg(pathEl),
                    totalLength: getTotalLength(pathEl) * (p / 100)
                  }
                }
              }
              
              function getPathProgress(path, progress) {
                function point(offset) {
                  if ( offset === void 0 ) offset = 0;
              
                  var l = progress + offset >= 1 ? progress + offset : 0;
                  return path.el.getPointAtLength(l);
                }
                var svg = getParentSvg(path.el, path.svg);
                var p = point();
                var p0 = point(-1);
                var p1 = point(+1);
                switch (path.property) {
                  case 'x': return (p.x - svg.x) * svg.w;
                  case 'y': return (p.y - svg.y) * svg.h;
                  case 'angle': return Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
                }
              }
              
              // Decompose value
              
              function decomposeValue(val, unit) {
                // const rgx = /-?\d*\.?\d+/g; // handles basic numbers
                // const rgx = /[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
                var rgx = /[+-]?\d*\.?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g; // handles exponents notation
                var value = validateValue((is.pth(val) ? val.totalLength : val), unit) + '';
                return {
                  original: value,
                  numbers: value.match(rgx) ? value.match(rgx).map(Number) : [0],
                  strings: (is.str(val) || unit) ? value.split(rgx) : []
                }
              }
              
              // Animatables
              
              function parseTargets(targets) {
                var targetsArray = targets ? (flattenArray(is.arr(targets) ? targets.map(toArray) : toArray(targets))) : [];
                return filterArray(targetsArray, function (item, pos, self) { return self.indexOf(item) === pos; });
              }
              
              function getAnimatables(targets) {
                var parsed = parseTargets(targets);
                return parsed.map(function (t, i) {
                  return {target: t, id: i, total: parsed.length, transforms: { list: getElementTransforms(t) } };
                });
              }
              
              // Properties
              
              function normalizePropertyTweens(prop, tweenSettings) {
                var settings = cloneObject(tweenSettings);
                // Override duration if easing is a spring
                if (/^spring/.test(settings.easing)) { settings.duration = spring(settings.easing); }
                if (is.arr(prop)) {
                  var l = prop.length;
                  var isFromTo = (l === 2 && !is.obj(prop[0]));
                  if (!isFromTo) {
                    // Duration divided by the number of tweens
                    if (!is.fnc(tweenSettings.duration)) { settings.duration = tweenSettings.duration / l; }
                  } else {
                    // Transform [from, to] values shorthand to a valid tween value
                    prop = {value: prop};
                  }
                }
                var propArray = is.arr(prop) ? prop : [prop];
                return propArray.map(function (v, i) {
                  var obj = (is.obj(v) && !is.pth(v)) ? v : {value: v};
                  // Default delay value should only be applied to the first tween
                  if (is.und(obj.delay)) { obj.delay = !i ? tweenSettings.delay : 0; }
                  // Default endDelay value should only be applied to the last tween
                  if (is.und(obj.endDelay)) { obj.endDelay = i === propArray.length - 1 ? tweenSettings.endDelay : 0; }
                  return obj;
                }).map(function (k) { return mergeObjects(k, settings); });
              }
              
              
              function flattenKeyframes(keyframes) {
                var propertyNames = filterArray(flattenArray(keyframes.map(function (key) { return Object.keys(key); })), function (p) { return is.key(p); })
                .reduce(function (a,b) { if (a.indexOf(b) < 0) { a.push(b); } return a; }, []);
                var properties = {};
                var loop = function ( i ) {
                  var propName = propertyNames[i];
                  properties[propName] = keyframes.map(function (key) {
                    var newKey = {};
                    for (var p in key) {
                      if (is.key(p)) {
                        if (p == propName) { newKey.value = key[p]; }
                      } else {
                        newKey[p] = key[p];
                      }
                    }
                    return newKey;
                  });
                };
              
                for (var i = 0; i < propertyNames.length; i++) loop( i );
                return properties;
              }
              
              function getProperties(tweenSettings, params) {
                var properties = [];
                var keyframes = params.keyframes;
                if (keyframes) { params = mergeObjects(flattenKeyframes(keyframes), params); }
                for (var p in params) {
                  if (is.key(p)) {
                    properties.push({
                      name: p,
                      tweens: normalizePropertyTweens(params[p], tweenSettings)
                    });
                  }
                }
                return properties;
              }
              
              // Tweens
              
              function normalizeTweenValues(tween, animatable) {
                var t = {};
                for (var p in tween) {
                  var value = getFunctionValue(tween[p], animatable);
                  if (is.arr(value)) {
                    value = value.map(function (v) { return getFunctionValue(v, animatable); });
                    if (value.length === 1) { value = value[0]; }
                  }
                  t[p] = value;
                }
                t.duration = parseFloat(t.duration);
                t.delay = parseFloat(t.delay);
                return t;
              }
              
              function normalizeTweens(prop, animatable) {
                var previousTween;
                return prop.tweens.map(function (t) {
                  var tween = normalizeTweenValues(t, animatable);
                  var tweenValue = tween.value;
                  var to = is.arr(tweenValue) ? tweenValue[1] : tweenValue;
                  var toUnit = getUnit(to);
                  var originalValue = getOriginalTargetValue(animatable.target, prop.name, toUnit, animatable);
                  var previousValue = previousTween ? previousTween.to.original : originalValue;
                  var from = is.arr(tweenValue) ? tweenValue[0] : previousValue;
                  var fromUnit = getUnit(from) || getUnit(originalValue);
                  var unit = toUnit || fromUnit;
                  if (is.und(to)) { to = previousValue; }
                  tween.from = decomposeValue(from, unit);
                  tween.to = decomposeValue(getRelativeValue(to, from), unit);
                  tween.start = previousTween ? previousTween.end : 0;
                  tween.end = tween.start + tween.delay + tween.duration + tween.endDelay;
                  tween.easing = parseEasings(tween.easing, tween.duration);
                  tween.isPath = is.pth(tweenValue);
                  tween.isColor = is.col(tween.from.original);
                  if (tween.isColor) { tween.round = 1; }
                  previousTween = tween;
                  return tween;
                });
              }
              
              // Tween progress
              
              var setProgressValue = {
                css: function (t, p, v) { return t.style[p] = v; },
                attribute: function (t, p, v) { return t.setAttribute(p, v); },
                object: function (t, p, v) { return t[p] = v; },
                transform: function (t, p, v, transforms, manual) {
                  transforms.list.set(p, v);
                  if (p === transforms.last || manual) {
                    var str = '';
                    transforms.list.forEach(function (value, prop) { str += prop + "(" + value + ") "; });
                    t.style.transform = str;
                  }
                }
              };
              
              // Set Value helper
              
              function setTargetsValue(targets, properties) {
                var animatables = getAnimatables(targets);
                animatables.forEach(function (animatable) {
                  for (var property in properties) {
                    var value = getFunctionValue(properties[property], animatable);
                    var target = animatable.target;
                    var valueUnit = getUnit(value);
                    var originalValue = getOriginalTargetValue(target, property, valueUnit, animatable);
                    var unit = valueUnit || getUnit(originalValue);
                    var to = getRelativeValue(validateValue(value, unit), originalValue);
                    var animType = getAnimationType(target, property);
                    setProgressValue[animType](target, property, to, animatable.transforms, true);
                  }
                });
              }
              
              // Animations
              
              function createAnimation(animatable, prop) {
                var animType = getAnimationType(animatable.target, prop.name);
                if (animType) {
                  var tweens = normalizeTweens(prop, animatable);
                  var lastTween = tweens[tweens.length - 1];
                  return {
                    type: animType,
                    property: prop.name,
                    animatable: animatable,
                    tweens: tweens,
                    duration: lastTween.end,
                    delay: tweens[0].delay,
                    endDelay: lastTween.endDelay
                  }
                }
              }
              
              function getAnimations(animatables, properties) {
                return filterArray(flattenArray(animatables.map(function (animatable) {
                  return properties.map(function (prop) {
                    return createAnimation(animatable, prop);
                  });
                })), function (a) { return !is.und(a); });
              }
              
              // Create Instance
              
              function getInstanceTimings(animations, tweenSettings) {
                var animLength = animations.length;
                var getTlOffset = function (anim) { return anim.timelineOffset ? anim.timelineOffset : 0; };
                var timings = {};
                timings.duration = animLength ? Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration; })) : tweenSettings.duration;
                timings.delay = animLength ? Math.min.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.delay; })) : tweenSettings.delay;
                timings.endDelay = animLength ? timings.duration - Math.max.apply(Math, animations.map(function (anim) { return getTlOffset(anim) + anim.duration - anim.endDelay; })) : tweenSettings.endDelay;
                return timings;
              }
              
              var instanceID = 0;
              
              function createNewInstance(params) {
                var instanceSettings = replaceObjectProps(defaultInstanceSettings, params);
                var tweenSettings = replaceObjectProps(defaultTweenSettings, params);
                var properties = getProperties(tweenSettings, params);
                var animatables = getAnimatables(params.targets);
                var animations = getAnimations(animatables, properties);
                var timings = getInstanceTimings(animations, tweenSettings);
                var id = instanceID;
                instanceID++;
                return mergeObjects(instanceSettings, {
                  id: id,
                  children: [],
                  animatables: animatables,
                  animations: animations,
                  duration: timings.duration,
                  delay: timings.delay,
                  endDelay: timings.endDelay
                });
              }
              
              // Core
              
              var activeInstances = [];
              var pausedInstances = [];
              var raf;
              
              var engine = (function () {
                function play() { 
                  raf = requestAnimationFrame(step);
                }
                function step(t) {
                  var activeInstancesLength = activeInstances.length;
                  if (activeInstancesLength) {
                    var i = 0;
                    while (i < activeInstancesLength) {
                      var activeInstance = activeInstances[i];
                      if (!activeInstance.paused) {
                        activeInstance.tick(t);
                      } else {
                        var instanceIndex = activeInstances.indexOf(activeInstance);
                        if (instanceIndex > -1) {
                          activeInstances.splice(instanceIndex, 1);
                          activeInstancesLength = activeInstances.length;
                        }
                      }
                      i++;
                    }
                    play();
                  } else {
                    raf = cancelAnimationFrame(raf);
                  }
                }
                return play;
              })();
              
              function handleVisibilityChange() {
                if (document.hidden) {
                  activeInstances.forEach(function (ins) { return ins.pause(); });
                  pausedInstances = activeInstances.slice(0);
                  anime.running = activeInstances = [];
                } else {
                  pausedInstances.forEach(function (ins) { return ins.play(); });
                }
              }
              
              if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', handleVisibilityChange);
              }
              
              // Public Instance
              
              function anime(params) {
                if ( params === void 0 ) params = {};
              
              
                var startTime = 0, lastTime = 0, now = 0;
                var children, childrenLength = 0;
                var resolve = null;
              
                function makePromise(instance) {
                  var promise = window.Promise && new Promise(function (_resolve) { return resolve = _resolve; });
                  instance.finished = promise;
                  return promise;
                }
              
                var instance = createNewInstance(params);
                var promise = makePromise(instance);
              
                function toggleInstanceDirection() {
                  var direction = instance.direction;
                  if (direction !== 'alternate') {
                    instance.direction = direction !== 'normal' ? 'normal' : 'reverse';
                  }
                  instance.reversed = !instance.reversed;
                  children.forEach(function (child) { return child.reversed = instance.reversed; });
                }
              
                function adjustTime(time) {
                  return instance.reversed ? instance.duration - time : time;
                }
              
                function resetTime() {
                  startTime = 0;
                  lastTime = adjustTime(instance.currentTime) * (1 / anime.speed);
                }
              
                function seekChild(time, child) {
                  if (child) { child.seek(time - child.timelineOffset); }
                }
              
                function syncInstanceChildren(time) {
                  if (!instance.reversePlayback) {
                    for (var i = 0; i < childrenLength; i++) { seekChild(time, children[i]); }
                  } else {
                    for (var i$1 = childrenLength; i$1--;) { seekChild(time, children[i$1]); }
                  }
                }
              
                function setAnimationsProgress(insTime) {
                  var i = 0;
                  var animations = instance.animations;
                  var animationsLength = animations.length;
                  while (i < animationsLength) {
                    var anim = animations[i];
                    var animatable = anim.animatable;
                    var tweens = anim.tweens;
                    var tweenLength = tweens.length - 1;
                    var tween = tweens[tweenLength];
                    // Only check for keyframes if there is more than one tween
                    if (tweenLength) { tween = filterArray(tweens, function (t) { return (insTime < t.end); })[0] || tween; }
                    var elapsed = minMax(insTime - tween.start - tween.delay, 0, tween.duration) / tween.duration;
                    var eased = isNaN(elapsed) ? 1 : tween.easing(elapsed);
                    var strings = tween.to.strings;
                    var round = tween.round;
                    var numbers = [];
                    var toNumbersLength = tween.to.numbers.length;
                    var progress = (void 0);
                    for (var n = 0; n < toNumbersLength; n++) {
                      var value = (void 0);
                      var toNumber = tween.to.numbers[n];
                      var fromNumber = tween.from.numbers[n] || 0;
                      if (!tween.isPath) {
                        value = fromNumber + (eased * (toNumber - fromNumber));
                      } else {
                        value = getPathProgress(tween.value, eased * toNumber);
                      }
                      if (round) {
                        if (!(tween.isColor && n > 2)) {
                          value = Math.round(value * round) / round;
                        }
                      }
                      numbers.push(value);
                    }
                    // Manual Array.reduce for better performances
                    var stringsLength = strings.length;
                    if (!stringsLength) {
                      progress = numbers[0];
                    } else {
                      progress = strings[0];
                      for (var s = 0; s < stringsLength; s++) {
                        var a = strings[s];
                        var b = strings[s + 1];
                        var n$1 = numbers[s];
                        if (!isNaN(n$1)) {
                          if (!b) {
                            progress += n$1 + ' ';
                          } else {
                            progress += n$1 + b;
                          }
                        }
                      }
                    }
                    setProgressValue[anim.type](animatable.target, anim.property, progress, animatable.transforms);
                    anim.currentValue = progress;
                    i++;
                  }
                }
              
                function setCallback(cb) {
                  if (instance[cb] && !instance.passThrough) { instance[cb](instance); }
                }
              
                function countIteration() {
                  if (instance.remaining && instance.remaining !== true) {
                    instance.remaining--;
                  }
                }
              
                function setInstanceProgress(engineTime) {
                  var insDuration = instance.duration;
                  var insDelay = instance.delay;
                  var insEndDelay = insDuration - instance.endDelay;
                  var insTime = adjustTime(engineTime);
                  instance.progress = minMax((insTime / insDuration) * 100, 0, 100);
                  instance.reversePlayback = insTime < instance.currentTime;
                  if (children) { syncInstanceChildren(insTime); }
                  if (!instance.began && instance.currentTime > 0) {
                    instance.began = true;
                    setCallback('begin');
                  }
                  if (!instance.loopBegan && instance.currentTime > 0) {
                    instance.loopBegan = true;
                    setCallback('loopBegin');
                  }
                  if (insTime <= insDelay && instance.currentTime !== 0) {
                    setAnimationsProgress(0);
                  }
                  if ((insTime >= insEndDelay && instance.currentTime !== insDuration) || !insDuration) {
                    setAnimationsProgress(insDuration);
                  }
                  if (insTime > insDelay && insTime < insEndDelay) {
                    if (!instance.changeBegan) {
                      instance.changeBegan = true;
                      instance.changeCompleted = false;
                      setCallback('changeBegin');
                    }
                    setCallback('change');
                    setAnimationsProgress(insTime);
                  } else {
                    if (instance.changeBegan) {
                      instance.changeCompleted = true;
                      instance.changeBegan = false;
                      setCallback('changeComplete');
                    }
                  }
                  instance.currentTime = minMax(insTime, 0, insDuration);
                  if (instance.began) { setCallback('update'); }
                  if (engineTime >= insDuration) {
                    lastTime = 0;
                    countIteration();
                    if (!instance.remaining) {
                      instance.paused = true;
                      if (!instance.completed) {
                        instance.completed = true;
                        setCallback('loopComplete');
                        setCallback('complete');
                        if (!instance.passThrough && 'Promise' in window) {
                          resolve();
                          promise = makePromise(instance);
                        }
                      }
                    } else {
                      startTime = now;
                      setCallback('loopComplete');
                      instance.loopBegan = false;
                      if (instance.direction === 'alternate') {
                        toggleInstanceDirection();
                      }
                    }
                  }
                }
              
                instance.reset = function() {
                  var direction = instance.direction;
                  instance.passThrough = false;
                  instance.currentTime = 0;
                  instance.progress = 0;
                  instance.paused = true;
                  instance.began = false;
                  instance.loopBegan = false;
                  instance.changeBegan = false;
                  instance.completed = false;
                  instance.changeCompleted = false;
                  instance.reversePlayback = false;
                  instance.reversed = direction === 'reverse';
                  instance.remaining = instance.loop;
                  children = instance.children;
                  childrenLength = children.length;
                  for (var i = childrenLength; i--;) { instance.children[i].reset(); }
                  if (instance.reversed && instance.loop !== true || (direction === 'alternate' && instance.loop === 1)) { instance.remaining++; }
                  setAnimationsProgress(instance.reversed ? instance.duration : 0);
                };
              
                // Set Value helper
              
                instance.set = function(targets, properties) {
                  setTargetsValue(targets, properties);
                  return instance;
                };
              
                instance.tick = function(t) {
                  now = t;
                  if (!startTime) { startTime = now; }
                  setInstanceProgress((now + (lastTime - startTime)) * anime.speed);
                };
              
                instance.seek = function(time) {
                  setInstanceProgress(adjustTime(time));
                };
              
                instance.pause = function() {
                  instance.paused = true;
                  resetTime();
                };
              
                instance.play = function() {
                  if (!instance.paused) { return; }
                  if (instance.completed) { instance.reset(); }
                  instance.paused = false;
                  activeInstances.push(instance);
                  resetTime();
                  if (!raf) { engine(); }
                };
              
                instance.reverse = function() {
                  toggleInstanceDirection();
                  resetTime();
                };
              
                instance.restart = function() {
                  instance.reset();
                  instance.play();
                };
              
                instance.reset();
              
                if (instance.autoplay) { instance.play(); }
              
                return instance;
              
              }
              
              // Remove targets from animation
              
              function removeTargetsFromAnimations(targetsArray, animations) {
                for (var a = animations.length; a--;) {
                  if (arrayContains(targetsArray, animations[a].animatable.target)) {
                    animations.splice(a, 1);
                  }
                }
              }
              
              function removeTargets(targets) {
                var targetsArray = parseTargets(targets);
                for (var i = activeInstances.length; i--;) {
                  var instance = activeInstances[i];
                  var animations = instance.animations;
                  var children = instance.children;
                  removeTargetsFromAnimations(targetsArray, animations);
                  for (var c = children.length; c--;) {
                    var child = children[c];
                    var childAnimations = child.animations;
                    removeTargetsFromAnimations(targetsArray, childAnimations);
                    if (!childAnimations.length && !child.children.length) { children.splice(c, 1); }
                  }
                  if (!animations.length && !children.length) { instance.pause(); }
                }
              }
              
              // Stagger helpers
              
              function stagger(val, params) {
                if ( params === void 0 ) params = {};
              
                var direction = params.direction || 'normal';
                var easing = params.easing ? parseEasings(params.easing) : null;
                var grid = params.grid;
                var axis = params.axis;
                var fromIndex = params.from || 0;
                var fromFirst = fromIndex === 'first';
                var fromCenter = fromIndex === 'center';
                var fromLast = fromIndex === 'last';
                var isRange = is.arr(val);
                var val1 = isRange ? parseFloat(val[0]) : parseFloat(val);
                var val2 = isRange ? parseFloat(val[1]) : 0;
                var unit = getUnit(isRange ? val[1] : val) || 0;
                var start = params.start || 0 + (isRange ? val1 : 0);
                var values = [];
                var maxValue = 0;
                return function (el, i, t) {
                  if (fromFirst) { fromIndex = 0; }
                  if (fromCenter) { fromIndex = (t - 1) / 2; }
                  if (fromLast) { fromIndex = t - 1; }
                  if (!values.length) {
                    for (var index = 0; index < t; index++) {
                      if (!grid) {
                        values.push(Math.abs(fromIndex - index));
                      } else {
                        var fromX = !fromCenter ? fromIndex%grid[0] : (grid[0]-1)/2;
                        var fromY = !fromCenter ? Math.floor(fromIndex/grid[0]) : (grid[1]-1)/2;
                        var toX = index%grid[0];
                        var toY = Math.floor(index/grid[0]);
                        var distanceX = fromX - toX;
                        var distanceY = fromY - toY;
                        var value = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
                        if (axis === 'x') { value = -distanceX; }
                        if (axis === 'y') { value = -distanceY; }
                        values.push(value);
                      }
                      maxValue = Math.max.apply(Math, values);
                    }
                    if (easing) { values = values.map(function (val) { return easing(val / maxValue) * maxValue; }); }
                    if (direction === 'reverse') { values = values.map(function (val) { return axis ? (val < 0) ? val * -1 : -val : Math.abs(maxValue - val); }); }
                  }
                  var spacing = isRange ? (val2 - val1) / maxValue : val1;
                  return start + (spacing * (Math.round(values[i] * 100) / 100)) + unit;
                }
              }
              
              // Timeline
              
              function timeline(params) {
                if ( params === void 0 ) params = {};
              
                var tl = anime(params);
                tl.duration = 0;
                tl.add = function(instanceParams, timelineOffset) {
                  var tlIndex = activeInstances.indexOf(tl);
                  var children = tl.children;
                  if (tlIndex > -1) { activeInstances.splice(tlIndex, 1); }
                  function passThrough(ins) { ins.passThrough = true; }
                  for (var i = 0; i < children.length; i++) { passThrough(children[i]); }
                  var insParams = mergeObjects(instanceParams, replaceObjectProps(defaultTweenSettings, params));
                  insParams.targets = insParams.targets || params.targets;
                  var tlDuration = tl.duration;
                  insParams.autoplay = false;
                  insParams.direction = tl.direction;
                  insParams.timelineOffset = is.und(timelineOffset) ? tlDuration : getRelativeValue(timelineOffset, tlDuration);
                  passThrough(tl);
                  tl.seek(insParams.timelineOffset);
                  var ins = anime(insParams);
                  passThrough(ins);
                  children.push(ins);
                  var timings = getInstanceTimings(children, params);
                  tl.delay = timings.delay;
                  tl.endDelay = timings.endDelay;
                  tl.duration = timings.duration;
                  tl.seek(0);
                  tl.reset();
                  if (tl.autoplay) { tl.play(); }
                  return tl;
                };
                return tl;
              }
              
              anime.version = '3.1.0';
              anime.speed = 1;
              anime.running = activeInstances;
              anime.remove = removeTargets;
              anime.get = getOriginalTargetValue;
              anime.set = setTargetsValue;
              anime.convertPx = convertPxToUnit;
              anime.path = getPath;
              anime.setDashoffset = setDashoffset;
              anime.stagger = stagger;
              anime.timeline = timeline;
              anime.easing = parseEasings;
              anime.penner = penner;
              anime.random = function (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; };


              // jquery input

              var $jscomp$this=this;
(function(v,p){"function"===typeof define&&define.amd?define([],p):"object"===typeof module&&module.exports?module.exports=p():v.anime=p()})(this,function(){function v(a){if(!g.col(a))try{return document.querySelectorAll(a)}catch(b){}}function p(a){return a.reduce(function(a,d){return a.concat(g.arr(d)?p(d):d)},[])}function w(a){if(g.arr(a))return a;g.str(a)&&(a=v(a)||a);return a instanceof NodeList||a instanceof HTMLCollection?[].slice.call(a):[a]}function F(a,b){return a.some(function(a){return a===b})}
function A(a){var b={},d;for(d in a)b[d]=a[d];return b}function G(a,b){var d=A(a),c;for(c in a)d[c]=b.hasOwnProperty(c)?b[c]:a[c];return d}function B(a,b){var d=A(a),c;for(c in b)d[c]=g.und(a[c])?b[c]:a[c];return d}function S(a){a=a.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i,function(a,b,d,h){return b+b+d+d+h+h});var b=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(a);a=parseInt(b[1],16);var d=parseInt(b[2],16),b=parseInt(b[3],16);return"rgb("+a+","+d+","+b+")"}function T(a){function b(a,b,c){0>
c&&(c+=1);1<c&&--c;return c<1/6?a+6*(b-a)*c:.5>c?b:c<2/3?a+(b-a)*(2/3-c)*6:a}var d=/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/g.exec(a);a=parseInt(d[1])/360;var c=parseInt(d[2])/100,d=parseInt(d[3])/100;if(0==c)c=d=a=d;else{var e=.5>d?d*(1+c):d+c-d*c,l=2*d-e,c=b(l,e,a+1/3),d=b(l,e,a);a=b(l,e,a-1/3)}return"rgb("+255*c+","+255*d+","+255*a+")"}function x(a){if(a=/([\+\-]?[0-9#\.]+)(%|px|pt|em|rem|in|cm|mm|ex|pc|vw|vh|deg|rad|turn)?/.exec(a))return a[2]}function U(a){if(-1<a.indexOf("translate"))return"px";
if(-1<a.indexOf("rotate")||-1<a.indexOf("skew"))return"deg"}function H(a,b){return g.fnc(a)?a(b.target,b.id,b.total):a}function C(a,b){if(b in a.style)return getComputedStyle(a).getPropertyValue(b.replace(/([a-z])([A-Z])/g,"$1-$2").toLowerCase())||"0"}function I(a,b){if(g.dom(a)&&F(V,b))return"transform";if(g.dom(a)&&(a.getAttribute(b)||g.svg(a)&&a[b]))return"attribute";if(g.dom(a)&&"transform"!==b&&C(a,b))return"css";if(null!=a[b])return"object"}function W(a,b){var d=U(b),d=-1<b.indexOf("scale")?
1:0+d;a=a.style.transform;if(!a)return d;for(var c=[],e=[],l=[],h=/(\w+)\((.+?)\)/g;c=h.exec(a);)e.push(c[1]),l.push(c[2]);a=l.filter(function(a,c){return e[c]===b});return a.length?a[0]:d}function J(a,b){switch(I(a,b)){case "transform":return W(a,b);case "css":return C(a,b);case "attribute":return a.getAttribute(b)}return a[b]||0}function K(a,b){var d=/^(\*=|\+=|-=)/.exec(a);if(!d)return a;b=parseFloat(b);a=parseFloat(a.replace(d[0],""));switch(d[0][0]){case "+":return b+a;case "-":return b-a;case "*":return b*
a}}function D(a){return g.obj(a)&&a.hasOwnProperty("totalLength")}function X(a,b){function d(c){c=void 0===c?0:c;return a.el.getPointAtLength(1<=b+c?b+c:0)}var c=d(),e=d(-1),l=d(1);switch(a.property){case "x":return c.x;case "y":return c.y;case "angle":return 180*Math.atan2(l.y-e.y,l.x-e.x)/Math.PI}}function L(a,b){var d=/-?\d*\.?\d+/g;a=D(a)?a.totalLength:a;if(g.col(a))b=g.rgb(a)?a:g.hex(a)?S(a):g.hsl(a)?T(a):void 0;else{var c=x(a);a=c?a.substr(0,a.length-c.length):a;b=b?a+b:a}b+="";return{original:b,
numbers:b.match(d)?b.match(d).map(Number):[0],strings:b.split(d)}}function Y(a,b){return b.reduce(function(b,c,e){return b+a[e-1]+c})}function M(a){return(a?p(g.arr(a)?a.map(w):w(a)):[]).filter(function(a,d,c){return c.indexOf(a)===d})}function Z(a){var b=M(a);return b.map(function(a,c){return{target:a,id:c,total:b.length}})}function aa(a,b){var d=A(b);if(g.arr(a)){var c=a.length;2!==c||g.obj(a[0])?g.fnc(b.duration)||(d.duration=b.duration/c):a={value:a}}return w(a).map(function(a,c){c=c?0:b.delay;
a=g.obj(a)&&!D(a)?a:{value:a};g.und(a.delay)&&(a.delay=c);return a}).map(function(a){return B(a,d)})}function ba(a,b){var d={},c;for(c in a){var e=H(a[c],b);g.arr(e)&&(e=e.map(function(a){return H(a,b)}),1===e.length&&(e=e[0]));d[c]=e}d.duration=parseFloat(d.duration);d.delay=parseFloat(d.delay);return d}function ca(a){return g.arr(a)?y.apply(this,a):N[a]}function da(a,b){var d;return a.tweens.map(function(c){c=ba(c,b);var e=c.value,l=J(b.target,a.name),h=d?d.to.original:l,h=g.arr(e)?e[0]:h,m=K(g.arr(e)?
e[1]:e,h),l=x(m)||x(h)||x(l);c.isPath=D(e);c.from=L(h,l);c.to=L(m,l);c.start=d?d.end:a.offset;c.end=c.start+c.delay+c.duration;c.easing=ca(c.easing);c.elasticity=(1E3-Math.min(Math.max(c.elasticity,1),999))/1E3;g.col(c.from.original)&&(c.round=1);return d=c})}function ea(a,b){return p(a.map(function(a){return b.map(function(b){var c=I(a.target,b.name);if(c){var d=da(b,a);b={type:c,property:b.name,animatable:a,tweens:d,duration:d[d.length-1].end,delay:d[0].delay}}else b=void 0;return b})})).filter(function(a){return!g.und(a)})}
function O(a,b,d){var c="delay"===a?Math.min:Math.max;return b.length?c.apply(Math,b.map(function(b){return b[a]})):d[a]}function fa(a){var b=G(ga,a),d=G(ha,a),c=Z(a.targets),e=[],g=B(b,d),h;for(h in a)g.hasOwnProperty(h)||"targets"===h||e.push({name:h,offset:g.offset,tweens:aa(a[h],d)});a=ea(c,e);return B(b,{children:[],animatables:c,animations:a,duration:O("duration",a,d),delay:O("delay",a,d)})}function n(a){function b(){return window.Promise&&new Promise(function(a){return Q=a})}function d(a){return f.reversed?
f.duration-a:a}function c(a){for(var b=0,c={},d=f.animations,e={};b<d.length;){var g=d[b],h=g.animatable,m=g.tweens;e.tween=m.filter(function(b){return a<b.end})[0]||m[m.length-1];e.isPath$1=e.tween.isPath;e.round=e.tween.round;e.eased=e.tween.easing(Math.min(Math.max(a-e.tween.start-e.tween.delay,0),e.tween.duration)/e.tween.duration,e.tween.elasticity);m=Y(e.tween.to.numbers.map(function(a){return function(b,c){c=a.isPath$1?0:a.tween.from.numbers[c];b=c+a.eased*(b-c);a.isPath$1&&(b=X(a.tween.value,
b));a.round&&(b=Math.round(b*a.round)/a.round);return b}}(e)),e.tween.to.strings);ia[g.type](h.target,g.property,m,c,h.id);g.currentValue=m;b++;e={isPath$1:e.isPath$1,tween:e.tween,eased:e.eased,round:e.round}}if(c)for(var k in c)E||(E=C(document.body,"transform")?"transform":"-webkit-transform"),f.animatables[k].target.style[E]=c[k].join(" ");f.currentTime=a;f.progress=a/f.duration*100}function e(a){if(f[a])f[a](f)}function g(){f.remaining&&!0!==f.remaining&&f.remaining--}function h(a){var h=f.duration,
l=f.offset,n=f.delay,P=f.currentTime,q=f.reversed,r=d(a),r=Math.min(Math.max(r,0),h);if(f.children){var p=f.children;if(r>=f.currentTime)for(var u=0;u<p.length;u++)p[u].seek(r);else for(u=p.length;u--;)p[u].seek(r)}r>l&&r<h?(c(r),!f.began&&r>=n&&(f.began=!0,e("begin")),e("run")):(r<=l&&0!==P&&(c(0),q&&g()),r>=h&&P!==h&&(c(h),q||g()));a>=h&&(f.remaining?(t=m,"alternate"===f.direction&&(f.reversed=!f.reversed)):(f.pause(),"Promise"in window&&(Q(),R=b()),f.completed||(f.completed=!0,e("complete"))),
k=0);e("update")}a=void 0===a?{}:a;var m,t,k=0,Q=null,R=b(),f=fa(a);f.reset=function(){var a=f.direction,b=f.loop;f.currentTime=0;f.progress=0;f.paused=!0;f.began=!1;f.completed=!1;f.reversed="reverse"===a;f.remaining="alternate"===a&&1===b?2:b;for(a=f.children.length;a--;)b=f.children[a],b.seek(b.offset),b.reset()};f.tick=function(a){m=a;t||(t=m);h((k+m-t)*n.speed)};f.seek=function(a){h(d(a))};f.pause=function(){var a=q.indexOf(f);-1<a&&q.splice(a,1);f.paused=!0};f.play=function(){f.paused&&(f.paused=
!1,t=0,k=d(f.currentTime),q.push(f),z||ja())};f.reverse=function(){f.reversed=!f.reversed;t=0;k=d(f.currentTime)};f.restart=function(){f.pause();f.reset();f.play()};f.finished=R;f.reset();f.autoplay&&f.play();return f}var ga={update:void 0,begin:void 0,run:void 0,complete:void 0,loop:1,direction:"normal",autoplay:!0,offset:0},ha={duration:1E3,delay:0,easing:"easeOutElastic",elasticity:500,round:0},V="translateX translateY translateZ rotate rotateX rotateY rotateZ scale scaleX scaleY scaleZ skewX skewY".split(" "),
E,g={arr:function(a){return Array.isArray(a)},obj:function(a){return-1<Object.prototype.toString.call(a).indexOf("Object")},svg:function(a){return a instanceof SVGElement},dom:function(a){return a.nodeType||g.svg(a)},str:function(a){return"string"===typeof a},fnc:function(a){return"function"===typeof a},und:function(a){return"undefined"===typeof a},hex:function(a){return/(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(a)},rgb:function(a){return/^rgb/.test(a)},hsl:function(a){return/^hsl/.test(a)},col:function(a){return g.hex(a)||
g.rgb(a)||g.hsl(a)}},y=function(){function a(a,d,c){return(((1-3*c+3*d)*a+(3*c-6*d))*a+3*d)*a}return function(b,d,c,e){if(0<=b&&1>=b&&0<=c&&1>=c){var g=new Float32Array(11);if(b!==d||c!==e)for(var h=0;11>h;++h)g[h]=a(.1*h,b,c);return function(h){if(b===d&&c===e)return h;if(0===h)return 0;if(1===h)return 1;for(var m=0,k=1;10!==k&&g[k]<=h;++k)m+=.1;--k;var k=m+(h-g[k])/(g[k+1]-g[k])*.1,l=3*(1-3*c+3*b)*k*k+2*(3*c-6*b)*k+3*b;if(.001<=l){for(m=0;4>m;++m){l=3*(1-3*c+3*b)*k*k+2*(3*c-6*b)*k+3*b;if(0===l)break;
var n=a(k,b,c)-h,k=k-n/l}h=k}else if(0===l)h=k;else{var k=m,m=m+.1,f=0;do n=k+(m-k)/2,l=a(n,b,c)-h,0<l?m=n:k=n;while(1e-7<Math.abs(l)&&10>++f);h=n}return a(h,d,e)}}}}(),N=function(){function a(a,b){return 0===a||1===a?a:-Math.pow(2,10*(a-1))*Math.sin(2*(a-1-b/(2*Math.PI)*Math.asin(1))*Math.PI/b)}var b="Quad Cubic Quart Quint Sine Expo Circ Back Elastic".split(" "),d={In:[[.55,.085,.68,.53],[.55,.055,.675,.19],[.895,.03,.685,.22],[.755,.05,.855,.06],[.47,0,.745,.715],[.95,.05,.795,.035],[.6,.04,.98,
.335],[.6,-.28,.735,.045],a],Out:[[.25,.46,.45,.94],[.215,.61,.355,1],[.165,.84,.44,1],[.23,1,.32,1],[.39,.575,.565,1],[.19,1,.22,1],[.075,.82,.165,1],[.175,.885,.32,1.275],function(b,c){return 1-a(1-b,c)}],InOut:[[.455,.03,.515,.955],[.645,.045,.355,1],[.77,0,.175,1],[.86,0,.07,1],[.445,.05,.55,.95],[1,0,0,1],[.785,.135,.15,.86],[.68,-.55,.265,1.55],function(b,c){return.5>b?a(2*b,c)/2:1-a(-2*b+2,c)/2}]},c={linear:y(.25,.25,.75,.75)},e={},l;for(l in d)e.type=l,d[e.type].forEach(function(a){return function(d,
e){c["ease"+a.type+b[e]]=g.fnc(d)?d:y.apply($jscomp$this,d)}}(e)),e={type:e.type};return c}(),ia={css:function(a,b,d){return a.style[b]=d},attribute:function(a,b,d){return a.setAttribute(b,d)},object:function(a,b,d){return a[b]=d},transform:function(a,b,d,c,e){c[e]||(c[e]=[]);c[e].push(b+"("+d+")")}},q=[],z=0,ja=function(){function a(){z=requestAnimationFrame(b)}function b(b){var c=q.length;if(c){for(var d=0;d<c;)q[d]&&q[d].tick(b),d++;a()}else cancelAnimationFrame(z),z=0}return a}();n.version="2.0.2";
n.speed=1;n.running=q;n.remove=function(a){a=M(a);for(var b=q.length;b--;)for(var d=q[b],c=d.animations,e=c.length;e--;)F(a,c[e].animatable.target)&&(c.splice(e,1),c.length||d.pause())};n.getValue=J;n.path=function(a,b){var d=g.str(a)?v(a)[0]:a,c=b||100;return function(a){return{el:d,property:a,totalLength:d.getTotalLength()*(c/100)}}};n.setDashoffset=function(a){var b=a.getTotalLength();a.setAttribute("stroke-dasharray",b);return b};n.bezier=y;n.easings=N;n.timeline=function(a){var b=n(a);b.pause();
b.duration=0;b.add=function(a){b.children.forEach(function(a){a.began=!0;a.completed=!0});w(a).forEach(function(a){var c=b.duration,d=a.offset;a.autoplay=!1;a.offset=g.und(d)?c:K(d,c);b.seek(a.offset);a=n(a);a.duration>c&&(b.duration=a.duration);a.began=!0;b.children.push(a)});b.reset();b.seek(0);b.autoplay&&b.restart();return b};return b};n.random=function(a,b){return Math.floor(Math.random()*(b-a+1))+a};return n});



              // Code injection


              window.human = false;

              var canvasEl = document.querySelector('.fireworks');
              var ctx = canvasEl.getContext('2d');
              var numberOfParticules = 30;
              var pointerX = 0;
              var pointerY = 0;
              var tap = ('ontouchstart' in window || navigator.msMaxTouchPoints) ? 'touchstart' : 'mousedown';
              var colors = ['#FF1461', '#18FF92', '#5A87FF', '#FBF38C'];
              
              function setCanvasSize() {
                canvasEl.width = window.innerWidth * 2;
                canvasEl.height = window.innerHeight * 2;
                canvasEl.style.width = window.innerWidth + 'px';
                canvasEl.style.height = window.innerHeight + 'px';
                canvasEl.getContext('2d').scale(2, 2);
              }
              
              function updateCoords(e) {
                pointerX = e.clientX || e.touches[0].clientX;
                pointerY = e.clientY || e.touches[0].clientY;
              }
              
              function setParticuleDirection(p) {
                var angle = anime.random(0, 360) * Math.PI / 180;
                var value = anime.random(50, 180);
                var radius = [-1, 1][anime.random(0, 1)] * value;
                return {
                  x: p.x + radius * Math.cos(angle),
                  y: p.y + radius * Math.sin(angle)
                }
              }
              
              function createParticule(x,y) {
                var p = {};
                p.x = x;
                p.y = y;
                p.color = colors[anime.random(0, colors.length - 1)];
                p.radius = anime.random(16, 32);
                p.endPos = setParticuleDirection(p);
                p.draw = function() {
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
                  ctx.fillStyle = p.color;
                  ctx.fill();
                }
                return p;
              }
              
              function createCircle(x,y) {
                var p = {};
                p.x = x;
                p.y = y;
                p.color = '#FFF';
                p.radius = 0.1;
                p.alpha = .5;
                p.lineWidth = 6;
                p.draw = function() {
                  ctx.globalAlpha = p.alpha;
                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI, true);
                  ctx.lineWidth = p.lineWidth;
                  ctx.strokeStyle = p.color;
                  ctx.stroke();
                  ctx.globalAlpha = 1;
                }
                return p;
              }
              
              function renderParticule(anim) {
                for (var i = 0; i < anim.animatables.length; i++) {
                  anim.animatables[i].target.draw();
                }
              }
              
              function animateParticules(x, y) {
                var circle = createCircle(x, y);
                var particules = [];
                for (var i = 0; i < numberOfParticules; i++) {
                  particules.push(createParticule(x, y));
                }
                anime.timeline().add({
                  targets: particules,
                  x: function(p) { return p.endPos.x; },
                  y: function(p) { return p.endPos.y; },
                  radius: 0.1,
                  duration: anime.random(1200, 1800),
                  easing: 'easeOutExpo',
                  update: renderParticule
                })
                  .add({
                  targets: circle,
                  radius: anime.random(80, 160),
                  lineWidth: 0,
                  alpha: {
                    value: 0,
                    easing: 'linear',
                    duration: anime.random(600, 800),  
                  },
                  duration: anime.random(1200, 1800),
                  easing: 'easeOutExpo',
                  update: renderParticule,
                  offset: 0
                });
              }
              
              var render = anime({
                duration: Infinity,
                update: function() {
                  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                }
              });
              
              document.addEventListener(tap, function(e) {
                window.human = true;
                render.play();
                updateCoords(e);
                animateParticules(pointerX, pointerY);
              }, false);
              
              var centerX = window.innerWidth / 2;
              var centerY = window.innerHeight / 2;
              
              function autoClick() {
                if (window.human) return;
                animateParticules(
                  anime.random(centerX-50, centerX+50), 
                  anime.random(centerY-50, centerY+50)
                );
                anime({duration: 200}).finished.then(autoClick);
              }
              
              autoClick();
              setCanvasSize();
              window.addEventListener('resize', setCanvasSize, false);

            this._updateRendering();
            this._setupEvents();
        },

        // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
        update: function (obj, callback) {

            this._contextObj = obj;
            this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
        },

        enable: function () { },
        disable: function () { },
        resize: function (box) { },
        // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
        uninitialize: function () {
            // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
        },

        // Attach events to HTML dom elements
        _setupEvents: function () {
        },

        // Rerender the interface.
        _updateRendering: function (callback) {
            if (this._contextObj !== null) {
            } else {
            }
            // The callback, coming from update, needs to be executed, to let the page know it finished rendering
            this._executeCallback(callback, "_updateRendering");
        },
        _executeCallback: function (cb, from) {
            if (cb && typeof cb === "function") {
                cb();
            }
        }
    });
});

require(["FireWorkAnime/widget/FireWorkAnime"]);
