/* charts.js — small SVG chart builders, no dependencies.
 *
 * House rules, taken from Tufte and applied literally:
 *   · no legends — every series is labelled where it ends
 *   · range-frames — an axis line spans the data, not the panel
 *   · no gridlines except where a reading has to be made across a gap
 *   · one mark per datum, nothing else that isn't a datum
 *   · the y-axis is NOT forced to zero on an index scale (PISA points and
 *     Attainment 8 are not ratio quantities; a zero baseline would compress
 *     every real difference into nothing). Where a baseline is meaningful it
 *     is drawn explicitly and labelled.
 *
 * Everything returns an <svg> element sized by viewBox, so the CSS can scale
 * it fluidly. Coordinates below are therefore "chart units", not pixels.
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* An svg is fluid downwards and fixed upwards: it may shrink to fit a
     narrow column, but it must never be blown up past its design size, or
     11px axis labels arrive on screen at 20px and the whole scale of the
     drawing goes with them. */
  function svg(w, h) {
    var s = el('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img' });
    s.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    s.setAttribute('style', 'max-width:' + w + 'px');
    return s;
  }

  function scale(d0, d1, r0, r1) {
    var span = (d1 - d0) || 1;
    var f = function (v) { return r0 + (v - d0) / span * (r1 - r0); };
    f.invert = function (p) { return d0 + (p - r0) / (r1 - r0) * span; };
    f.domain = [d0, d1];
    return f;
  }

  function extent(vals, pad) {
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var p = (hi - lo) * (pad === undefined ? 0.08 : pad) || 1;
    return [lo - p, hi + p];
  }

  function niceTicks(lo, hi, count) {
    var raw = (hi - lo) / (count || 5);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    var out = [], t = Math.ceil(lo / step) * step;
    for (; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1e6) / 1e6);
    return out;
  }

  var NATION_VAR = {
    'England': 'var(--eng)', 'Scotland': 'var(--sco)',
    'Northern Ireland': 'var(--nir)', 'Wales': 'var(--wal)',
    'OECD average': 'var(--ref)', 'OECD trend average': 'var(--ref)'
  };
  function colourOf(name) { return NATION_VAR[name] || 'var(--ink)'; }

  /* Push a column of end-labels apart until none overlaps its neighbour.
     Every chart here labels series directly rather than with a legend, so
     two nations finishing a point apart is routine — Scotland and Northern
     Ireland ended PISA 2025 1.3 science points apart. Solving it once, by
     geometry, beats hand-nudging every panel and then re-nudging it when the
     next cycle moves a line. */
  function spreadLabels(items, minGap, lo, hi) {
    if (items.length < 2) return items;
    var gap = minGap || 13;
    items.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < items.length; i++) {
      if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    }
    /* If the pile now runs off the bottom, slide the whole column back up. */
    if (hi !== undefined && items[items.length - 1].y > hi) {
      var over = items[items.length - 1].y - hi;
      for (var j = items.length - 1; j >= 0; j--) {
        items[j].y -= over;
        if (j && items[j].y - items[j - 1].y >= gap) break;
      }
    }
    if (lo !== undefined && items[0].y < lo) {
      var under = lo - items[0].y;
      for (var k = 0; k < items.length; k++) {
        items[k].y += under;
        if (k + 1 < items.length && items[k + 1].y - items[k].y >= gap) break;
      }
    }
    return items;
  }

  /* Shorten a nation name only where the panel is genuinely tight. */
  function shortName(n) {
    return n === 'Northern Ireland' ? 'N. Ireland'
         : n === 'OECD average' || n === 'OECD trend average' ? 'OECD'
         : n;
  }

  /* --- 1. small multiples of line series ------------------------------ *
   * opts: { panels:[{title, series:[{name, values:[{x,y}], dashed}] }],
   *          xTicks, yLabel, baseline:{y,label}, cols, panelW, panelH }   */
  function smallMultiples(opts) {
    var panels = opts.panels,
        cols = opts.cols || panels.length,
        rows = Math.ceil(panels.length / cols),
        pw = opts.panelW || 250,
        ph = opts.panelH || 210,
        gapX = opts.gapX || 68,
        gapY = opts.gapY || 54,
        mL = 34, mT = 26, mR = opts.mR === undefined ? 62 : opts.mR, mB = 34;

    var W = mL + cols * pw + (cols - 1) * gapX + mR,
        H = mT + rows * ph + (rows - 1) * gapY + mB;
    var s = svg(W, H);

    /* One y-domain across every panel: the whole point of small multiples is
       that the panels are directly comparable. */
    var allY = [], allX = [];
    panels.forEach(function (p) {
      p.series.forEach(function (se) {
        se.values.forEach(function (v) { allY.push(v.y); allX.push(v.x); });
      });
    });
    var yd = opts.yDomain || extent(allY, 0.1);
    var xd = [Math.min.apply(null, allX), Math.max.apply(null, allX)];

    panels.forEach(function (p, i) {
      var cx = mL + (i % cols) * (pw + gapX),
          cy = mT + Math.floor(i / cols) * (ph + gapY);
      var g = el('g', { transform: 'translate(' + cx + ',' + cy + ')' });

      var x = scale(xd[0], xd[1], 0, pw),
          y = scale(yd[0], yd[1], ph, 0);

      g.appendChild(el('text', { class: 'panel-title', x: 0, y: -10 }, p.title));

      /* y ticks: only on the leftmost panel of each row — repeating them is
         redundant ink when the scale is shared. */
      if (i % cols === 0) {
        niceTicks(yd[0], yd[1], 4).forEach(function (t) {
          g.appendChild(el('text', { class: 'tick', x: -8, y: y(t) + 3.5, 'text-anchor': 'end' }, t));
        });
      }

      /* Baseline (e.g. the PISA scale's 500). Deliberately unlabelled in the
         plot: any position for the caption collides with a series in one panel
         or another, and the figure's subtitle can carry it for free. */
      if (opts.baseline !== undefined && opts.baseline >= yd[0] && opts.baseline <= yd[1]) {
        g.appendChild(el('line', {
          x1: 0, x2: pw, y1: y(opts.baseline), y2: y(opts.baseline),
          class: 'rule-faint', 'stroke-dasharray': '2 3'
        }));
      }

      /* Range-frame x axis: spans the data, no box. */
      g.appendChild(el('line', { x1: x(xd[0]), x2: x(xd[1]), y1: ph, y2: ph, class: 'rule' }));
      (opts.xTicks || []).forEach(function (t) {
        g.appendChild(el('line', { x1: x(t), x2: x(t), y1: ph, y2: ph + 4, class: 'rule' }));
        g.appendChild(el('text', { class: 'tick', x: x(t), y: ph + 16, 'text-anchor': 'middle' },
          opts.xTickLabel ? opts.xTickLabel(t) : t));
      });

      var labels = [];
      p.series.forEach(function (se) {
        var col = colourOf(se.name);
        var d = se.values.map(function (v, j) { return (j ? 'L' : 'M') + x(v.x) + ',' + y(v.y); }).join(' ');
        g.appendChild(el('path', {
          d: d, fill: 'none', stroke: col, 'stroke-width': se.dashed ? 1.1 : 1.6,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'stroke-dasharray': se.dashed ? '3 3' : null
        }));
        se.values.forEach(function (v) {
          g.appendChild(el('circle', { cx: x(v.x), cy: y(v.y), r: 1.9, fill: col }));
        });
        var last = se.values[se.values.length - 1];
        /* An empty name means the caller drew this series as context rather
           than as a thing to look up; it gets no label and takes no room. */
        if (se.name) labels.push({ y: y(last.y) + 3.5, anchorY: y(last.y), name: se.name, col: col });
      });
      spreadLabels(labels, 13, 8, ph);
      labels.forEach(function (L) {
        /* A leader line where the label had to move off its own datum. */
        if (Math.abs(L.y - 3.5 - L.anchorY) > 3) {
          g.appendChild(el('path', {
            d: 'M' + (pw + 1) + ',' + L.anchorY + ' L' + (pw + 4) + ',' + (L.y - 3.5),
            stroke: L.col, 'stroke-width': 0.8, fill: 'none', opacity: 0.55
          }));
        }
        g.appendChild(el('text', { class: 'series-label', x: pw + 6, y: L.y, fill: L.col },
          shortName(L.name)));
      });

      s.appendChild(g);
    });

    if (opts.yLabel) {
      s.appendChild(el('text', { class: 'axis-label', x: 0, y: 12 }, opts.yLabel));
    }
    return s;
  }

  /* --- 2. dumbbell / paired dot plot ---------------------------------- *
   * opts: { rows:[{label, a, b, highlight}], aLabel, bLabel, xLabel,
   *          valueFmt, width, rowH }                                      */
  function dumbbell(opts) {
    var rows = opts.rows,
        rowH = opts.rowH || 26,
        mL = opts.labelW || 150, mR = 54, mT = 42, mB = 30,
        pw = (opts.width || 620) - mL - mR,
        H = mT + rows.length * rowH + mB,
        W = mL + pw + mR;
    var s = svg(W, H);

    var vals = [];
    rows.forEach(function (r) { vals.push(r.a, r.b); });
    var xd = opts.xDomain || extent(vals, 0.1);
    var x = scale(xd[0], xd[1], 0, pw);
    var g = el('g', { transform: 'translate(' + mL + ',' + mT + ')' });

    niceTicks(xd[0], xd[1], 5).forEach(function (t) {
      g.appendChild(el('line', { x1: x(t), x2: x(t), y1: -8, y2: rows.length * rowH - 8, class: 'rule-faint' }));
      g.appendChild(el('text', { class: 'tick', x: x(t), y: -14, 'text-anchor': 'middle' }, t));
    });

    rows.forEach(function (r, i) {
      var cy = i * rowH + 4;
      var dim = r.highlight === false;
      g.appendChild(el('line', {
        x1: x(r.a), x2: x(r.b), y1: cy, y2: cy,
        stroke: dim ? 'var(--rule)' : 'var(--ink-faint)', 'stroke-width': dim ? 1 : 1.4
      }));
      g.appendChild(el('circle', { cx: x(r.a), cy: cy, r: 4, fill: r.aColour || 'var(--wal)', opacity: dim ? 0.45 : 1 }));
      g.appendChild(el('circle', { cx: x(r.b), cy: cy, r: 4, fill: r.bColour || 'var(--eng)', opacity: dim ? 0.45 : 1 }));
      g.appendChild(el('text', {
        x: -12, y: cy + 4, 'text-anchor': 'end',
        class: 'axis-label', 'font-weight': r.bold ? 600 : 400,
        fill: r.bold ? 'var(--ink)' : 'var(--ink-soft)'
      }, r.label));
      if (opts.showDelta) {
        g.appendChild(el('text', { class: 'value', x: pw + 12, y: cy + 4 },
          (r.b - r.a > 0 ? '+' : '−') + Math.abs(r.b - r.a).toFixed(1)));
      }
      /* Label the two ends once, on the first row, in place of a legend. */
      if (i === 0) {
        g.appendChild(el('text', {
          class: 'series-label', x: x(r.a), y: cy - 12, 'text-anchor': 'middle',
          fill: r.aColour || 'var(--wal)'
        }, opts.aLabel));
        g.appendChild(el('text', {
          class: 'series-label', x: x(r.b), y: cy - 12, 'text-anchor': 'middle',
          fill: r.bColour || 'var(--eng)'
        }, opts.bLabel));
      }
    });

    if (opts.xLabel) {
      g.appendChild(el('text', { class: 'axis-label', x: 0, y: rows.length * rowH + 16 }, opts.xLabel));
    }
    if (opts.deltaLabel) {
      g.appendChild(el('text', { class: 'note', x: pw + 12, y: -14 }, opts.deltaLabel));
    }
    s.appendChild(g);
    return s;
  }

  /* Rough text metrics. Good enough to keep labels off one another without
     needing the node in the document first, which would force every chart to
     be built after mounting. system-ui at 11px averages a shade under 6px a
     character; the margin is deliberately generous. */
  function textWidth(str, px) {
    return str.length * (px || 11) * 0.55 + 2;
  }

  /* Greedy label placement for scatters. Each label tries eight positions
     around its own point and takes the first that hits nothing already on the
     canvas. Points are placed before labels, and the most extreme points get
     first pick, so the outliers a reader actually looks up are the ones that
     keep the natural position. */
  function placeLabels(items, w, h) {
    var placed = items.map(function (it) {
      return { x: it.px - 4, y: it.py - 4, w: 8, h: 8 };
    });
    /* Near ring first, then a farther one for crowded clusters. A label from
       the far ring gets a leader line back to its point, because at that
       distance the reader can no longer tell by eye which mark it belongs
       to. */
    var CAND = [
      [8, 4, 'start'], [-8, 4, 'end'], [0, -8, 'middle'], [0, 15, 'middle'],
      [8, -6, 'start'], [-8, -6, 'end'], [8, 14, 'start'], [-8, 14, 'end'],
      [0, -20, 'middle'], [0, 27, 'middle'], [20, -16, 'start'], [-20, -16, 'end'],
      [20, 22, 'start'], [-20, 22, 'end'], [0, -32, 'middle'], [0, 39, 'middle']
    ];
    items.slice().sort(function (a, b) { return b.priority - a.priority; }).forEach(function (it) {
      var tw = textWidth(it.text), th = 12, best = null, bestCost = Infinity;
      for (var i = 0; i < CAND.length; i++) {
        var c = CAND[i];
        var lx = it.px + c[0] - (c[2] === 'end' ? tw : c[2] === 'middle' ? tw / 2 : 0);
        var ly = it.py + c[1] - 9;
        var box = { x: lx, y: ly, w: tw, h: th };
        var cost = i * 0.5;
        if (box.x < 0 || box.y < 0 || box.x + box.w > w || box.y + box.h > h) cost += 40;
        for (var j = 0; j < placed.length; j++) {
          var o = placed[j];
          var ox = Math.min(box.x + box.w, o.x + o.w) - Math.max(box.x, o.x);
          var oy = Math.min(box.y + box.h, o.y + o.h) - Math.max(box.y, o.y);
          if (ox > 0 && oy > 0) cost += 10 + ox * oy / 40;
        }
        if (cost < bestCost) { bestCost = cost; best = { c: c, box: box }; }
        if (cost <= i * 0.5) break;
      }
      it.dx = best.c[0]; it.dy = best.c[1]; it.anchor = best.c[2];
      it.far = Math.abs(best.c[1]) > 16;
      placed.push(best.box);
    });
    return items;
  }

  /* --- 3. labelled scatter, optional least-squares fit ---------------- *
   * opts: { points:[{x,y,label,colour,highlight,dx,dy}], xLabel, yLabel,
   *          fit:'all'|'excludeHighlight'|null, width, height, fitNote }  */
  function scatter(opts) {
    var pts = opts.points,
        mL = 52, mR = 22, mT = 20, mB = 46,
        pw = (opts.width || 560) - mL - mR,
        ph = (opts.height || 340) - mT - mB;
    var s = svg(mL + pw + mR, mT + ph + mB);

    var xd = opts.xDomain || extent(pts.map(function (p) { return p.x; }), 0.12),
        yd = opts.yDomain || extent(pts.map(function (p) { return p.y; }), 0.12);
    var x = scale(xd[0], xd[1], 0, pw),
        y = scale(yd[0], yd[1], ph, 0);
    var g = el('g', { transform: 'translate(' + mL + ',' + mT + ')' });

    niceTicks(yd[0], yd[1], 4).forEach(function (t) {
      g.appendChild(el('line', { x1: 0, x2: pw, y1: y(t), y2: y(t), class: 'rule-faint' }));
      g.appendChild(el('text', { class: 'tick', x: -9, y: y(t) + 3.5, 'text-anchor': 'end' },
        opts.yFmt ? opts.yFmt(t) : t));
    });
    niceTicks(xd[0], xd[1], 4).forEach(function (t) {
      g.appendChild(el('line', { x1: x(t), x2: x(t), y1: ph, y2: ph + 4, class: 'rule' }));
      g.appendChild(el('text', { class: 'tick', x: x(t), y: ph + 17, 'text-anchor': 'middle' },
        opts.xFmt ? opts.xFmt(t) : t));
    });
    g.appendChild(el('line', { x1: 0, x2: pw, y1: ph, y2: ph, class: 'rule' }));

    /* Fit line, when the caller asks for one. Drawn behind the marks and
       kept faint: it is an interpretation, not an observation. */
    if (opts.fit) {
      var use = pts.filter(function (p) { return opts.fit === 'all' || !p.highlight; });
      if (use.length > 2) {
        var n = use.length,
            mx = use.reduce(function (a, p) { return a + p.x; }, 0) / n,
            my = use.reduce(function (a, p) { return a + p.y; }, 0) / n,
            num = use.reduce(function (a, p) { return a + (p.x - mx) * (p.y - my); }, 0),
            den = use.reduce(function (a, p) { return a + (p.x - mx) * (p.x - mx); }, 0);
        if (den) {
          var b = num / den, a0 = my - b * mx;
          var x0 = Math.min.apply(null, use.map(function (p) { return p.x; })),
              x1 = Math.max.apply(null, use.map(function (p) { return p.x; }));
          g.appendChild(el('line', {
            x1: x(x0), x2: x(x1), y1: y(a0 + b * x0), y2: y(a0 + b * x1),
            stroke: 'var(--ink-faint)', 'stroke-width': 1, 'stroke-dasharray': '4 3'
          }));
        }
      }
    }

    pts.forEach(function (p) {
      var col = p.colour || (p.highlight ? 'var(--accent)' : 'var(--ink)');
      g.appendChild(el('circle', {
        cx: x(p.x), cy: y(p.y), r: p.highlight ? 5 : 3.6,
        fill: p.highlight ? col : 'none', stroke: col, 'stroke-width': 1.5
      }));
    });

    var labelled = pts.filter(function (p) { return p.label; }).map(function (p) {
      return {
        text: p.label, px: x(p.x), py: y(p.y), p: p,
        /* Highlighted points, then those furthest from the middle of the
           cloud, get to keep the position a reader expects. */
        priority: (p.highlight ? 100 : 0) +
          Math.abs(x(p.x) - pw / 2) / pw + Math.abs(y(p.y) - ph / 2) / ph
      };
    });
    placeLabels(labelled, pw, ph);
    labelled.forEach(function (L) {
      var col = L.p.colour || (L.p.highlight ? 'var(--accent)' : 'var(--ink)');
      if (L.far) {
        g.appendChild(el('line', {
          x1: L.px, y1: L.py + (L.dy < 0 ? -5 : 5),
          x2: L.px + L.dx * 0.35, y2: L.py + L.dy - (L.dy < 0 ? -2 : 11),
          stroke: col, 'stroke-width': 0.7, opacity: 0.5
        }));
      }
      g.appendChild(el('text', {
        class: 'axis-label', x: L.px + L.dx, y: L.py + L.dy,
        'text-anchor': L.anchor,
        'font-weight': L.p.highlight ? 600 : 400,
        fill: L.p.highlight ? col : 'var(--ink-soft)'
      }, L.text));
    });

    if (opts.fitNote) g.appendChild(el('text', { class: 'note', x: 2, y: 10 }, opts.fitNote));
    if (opts.yLabel) {
      s.appendChild(el('text', {
        class: 'axis-label', transform: 'rotate(-90)', x: -(mT + ph / 2), y: 13, 'text-anchor': 'middle'
      }, opts.yLabel));
    }
    if (opts.xLabel) {
      s.appendChild(el('text', {
        class: 'axis-label', x: mL + pw / 2, y: mT + ph + 40, 'text-anchor': 'middle'
      }, opts.xLabel));
    }
    s.appendChild(g);
    return s;
  }

  /* --- 4. profile lines across ordered categories --------------------- *
   * Used for the socio-economic quartile profiles: one line per nation
   * across Q1..Q4, which lets composition and level be read apart.
   * opts: { categories:[..], series:[{name, values:[..], dy}], yLabel }    */
  function profile(opts) {
    var cats = opts.categories,
        mL = 46, mR = 96, mT = 18, mB = 46,
        pw = (opts.width || 560) - mL - mR,
        ph = (opts.height || 330) - mT - mB;
    var s = svg(mL + pw + mR, mT + ph + mB);

    var all = [];
    opts.series.forEach(function (se) { all = all.concat(se.values); });
    var yd = opts.yDomain || extent(all, 0.1);
    var y = scale(yd[0], yd[1], ph, 0);
    var x = function (i) { return cats.length === 1 ? pw / 2 : i / (cats.length - 1) * pw; };
    var g = el('g', { transform: 'translate(' + mL + ',' + mT + ')' });

    niceTicks(yd[0], yd[1], 4).forEach(function (t) {
      g.appendChild(el('line', { x1: 0, x2: pw, y1: y(t), y2: y(t), class: 'rule-faint' }));
      g.appendChild(el('text', { class: 'tick', x: -9, y: y(t) + 3.5, 'text-anchor': 'end' }, t));
    });
    cats.forEach(function (c, i) {
      g.appendChild(el('text', { class: 'tick', x: x(i), y: ph + 18, 'text-anchor': 'middle' }, c));
    });
    if (opts.xLabel) {
      g.appendChild(el('text', { class: 'axis-label', x: pw / 2, y: ph + 38, 'text-anchor': 'middle' }, opts.xLabel));
    }

    var labels = [];
    opts.series.forEach(function (se) {
      var col = colourOf(se.name);
      var d = se.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i) + ',' + y(v); }).join(' ');
      g.appendChild(el('path', {
        d: d, fill: 'none', stroke: col, 'stroke-width': se.dashed ? 1.1 : 1.7,
        'stroke-dasharray': se.dashed ? '3 3' : null, 'stroke-linejoin': 'round'
      }));
      se.values.forEach(function (v, i) {
        g.appendChild(el('circle', { cx: x(i), cy: y(v), r: 2.6, fill: col }));
      });
      var end = y(se.values[se.values.length - 1]);
      labels.push({ y: end + 3.5, anchorY: end, name: se.name, col: col });
    });
    spreadLabels(labels, 13, 8, ph);
    labels.forEach(function (L) {
      if (Math.abs(L.y - 3.5 - L.anchorY) > 3) {
        g.appendChild(el('path', {
          d: 'M' + (pw + 2) + ',' + L.anchorY + ' L' + (pw + 6) + ',' + (L.y - 3.5),
          stroke: L.col, 'stroke-width': 0.8, fill: 'none', opacity: 0.55
        }));
      }
      g.appendChild(el('text', { class: 'series-label', x: pw + 8, y: L.y, fill: L.col },
        shortName(L.name)));
    });

    if (opts.yLabel) {
      s.appendChild(el('text', {
        class: 'axis-label', transform: 'rotate(-90)', x: -(mT + ph / 2), y: 12, 'text-anchor': 'middle'
      }, opts.yLabel));
    }
    s.appendChild(g);
    return s;
  }

  /* --- 5. indexed dual series: two quantities on one time axis --------- *
   * Both rebased to 100 at the first year, so a real economy and a test
   * score can share a panel without implying they share units.
   * opts: { panels:[{title, series:[{name,values:[{x,y}],colour,dash}]}] } */
  function indexPanels(opts) {
    var panels = opts.panels,
        cols = opts.cols || 2,
        rows = Math.ceil(panels.length / cols),
        pw = opts.panelW || 210, ph = opts.panelH || 160,
        gapX = opts.gapX || 74, gapY = 56, mL = opts.mL || 42, mT = 24,
        mR = opts.mR === undefined ? 62 : opts.mR, mB = 34;
    var W = mL + cols * pw + (cols - 1) * gapX + mR,
        H = mT + rows * ph + (rows - 1) * gapY + mB;
    var s = svg(W, H);

    var allY = [], allX = [];
    panels.forEach(function (p) {
      p.series.forEach(function (se) { se.values.forEach(function (v) { allY.push(v.y); allX.push(v.x); }); });
    });
    var yd = opts.yDomain || extent(allY, 0.12);
    var xd = [Math.min.apply(null, allX), Math.max.apply(null, allX)];

    panels.forEach(function (p, i) {
      var g = el('g', {
        transform: 'translate(' + (mL + (i % cols) * (pw + gapX)) + ',' +
          (mT + Math.floor(i / cols) * (ph + gapY)) + ')'
      });
      var x = scale(xd[0], xd[1], 0, pw), y = scale(yd[0], yd[1], ph, 0);
      g.appendChild(el('text', { class: 'panel-title', x: 0, y: -9 }, p.title));

      if (i % cols === 0) {
        niceTicks(yd[0], yd[1], 4).forEach(function (t) {
          g.appendChild(el('text', { class: 'tick', x: -8, y: y(t) + 3.5, 'text-anchor': 'end' },
            opts.yFmt ? opts.yFmt(t) : t));
        });
      }
      g.appendChild(el('line', { x1: 0, x2: pw, y1: y(100), y2: y(100), class: 'rule-faint' }));
      g.appendChild(el('line', { x1: 0, x2: pw, y1: ph, y2: ph, class: 'rule' }));
      (opts.xTicks || []).forEach(function (t) {
        g.appendChild(el('line', { x1: x(t), x2: x(t), y1: ph, y2: ph + 4, class: 'rule' }));
        g.appendChild(el('text', { class: 'tick', x: x(t), y: ph + 16, 'text-anchor': 'middle' }, t));
      });

      var labels = [];
      p.series.forEach(function (se) {
        var col = se.colour || 'var(--ink)';
        g.appendChild(el('path', {
          d: se.values.map(function (v, j) { return (j ? 'L' : 'M') + x(v.x) + ',' + y(v.y); }).join(' '),
          fill: 'none', stroke: col, 'stroke-width': 1.6,
          'stroke-dasharray': se.dash || null, 'stroke-linejoin': 'round'
        }));
        var last = se.values[se.values.length - 1];
        /* An empty name means the caller drew this series as context rather
           than as a thing to look up; it gets no label and takes no room. */
        if (se.name) labels.push({ y: y(last.y) + 3.5, anchorY: y(last.y), name: se.name, col: col });
      });
      spreadLabels(labels, 13, 8, ph);
      labels.forEach(function (L) {
        if (Math.abs(L.y - 3.5 - L.anchorY) > 3) {
          g.appendChild(el('path', {
            d: 'M' + (pw + 1) + ',' + L.anchorY + ' L' + (pw + 4) + ',' + (L.y - 3.5),
            stroke: L.col, 'stroke-width': 0.8, fill: 'none', opacity: 0.55
          }));
        }
        g.appendChild(el('text', { class: 'series-label', x: pw + 6, y: L.y, fill: L.col }, L.name));
      });
      s.appendChild(g);
    });
    return s;
  }

  /* --- 6. faceted row chart ------------------------------------------ *
   * One small panel per facet, one row per category, a mark at the value
   * and a stalk back to a reference (usually zero, or a comparator).
   * Rows separate the categories vertically, so marks that sit a point
   * apart on the value axis can never collide — which a dot plot with all
   * four nations on one line cannot promise.
   * opts: { panels:[{title, rows:[{name, value}], ref}], xDomain, xLabel,
   *          refLabel, width, rowH, fmt }                                  */
  function rowChart(opts) {
    var panels = opts.panels,
        rowH = opts.rowH || 24,
        labelW = opts.labelW || 86,
        pw = opts.panelW || 168,
        gapX = opts.gapX || 30,
        mT = 26, mB = 40,
        n = panels[0].rows.length;
    var W = labelW + panels.length * pw + (panels.length - 1) * gapX + 10,
        H = mT + n * rowH + mB;
    var s = svg(W, H);

    var all = [];
    panels.forEach(function (p) { p.rows.forEach(function (r) { all.push(r.value); }); });
    var xd = opts.xDomain || extent(all, 0.12);

    panels.forEach(function (p, pi) {
      var ox = labelW + pi * (pw + gapX);
      var g = el('g', { transform: 'translate(' + ox + ',' + mT + ')' });
      var x = scale(xd[0], xd[1], 0, pw);
      var ref = p.ref === undefined ? opts.ref : p.ref;

      g.appendChild(el('text', { class: 'panel-title', x: 0, y: -12 }, p.title));

      niceTicks(xd[0], xd[1], 3).forEach(function (t) {
        g.appendChild(el('text', { class: 'tick', x: x(t), y: n * rowH + 14, 'text-anchor': 'middle' },
          opts.fmt ? opts.fmt(t) : t));
        g.appendChild(el('line', { x1: x(t), x2: x(t), y1: n * rowH + 2, y2: n * rowH + 6, class: 'rule' }));
      });
      g.appendChild(el('line', { x1: 0, x2: pw, y1: n * rowH + 2, y2: n * rowH + 2, class: 'rule' }));

      if (ref !== undefined) {
        g.appendChild(el('line', {
          x1: x(ref), x2: x(ref), y1: -4, y2: n * rowH + 2,
          stroke: 'var(--ink-faint)', 'stroke-width': 1
        }));
      }

      p.rows.forEach(function (r, i) {
        var cy = i * rowH + rowH / 2 - 2;
        var col = r.colour || colourOf(r.name);
        if (ref !== undefined) {
          g.appendChild(el('line', {
            x1: x(ref), x2: x(r.value), y1: cy, y2: cy, stroke: col, 'stroke-width': 1.4, opacity: 0.5
          }));
        }
        g.appendChild(el('circle', { cx: x(r.value), cy: cy, r: 4, fill: col }));
        g.appendChild(el('text', {
          class: 'value', x: x(r.value) + (r.value >= (ref === undefined ? xd[0] : ref) ? 8 : -8),
          y: cy + 3.5, 'text-anchor': r.value >= (ref === undefined ? xd[0] : ref) ? 'start' : 'end',
          fill: col
        }, opts.markFmt ? opts.markFmt(r.value) : r.value));
        if (pi === 0) {
          g.appendChild(el('text', {
            class: 'axis-label', x: -12, y: cy + 4, 'text-anchor': 'end',
            'font-weight': 600, fill: 'var(--ink)'
          }, shortName(r.name)));
        }
      });
      s.appendChild(g);
    });

    if (opts.xLabel) {
      s.appendChild(el('text', { class: 'axis-label', x: labelW, y: H - 8 }, opts.xLabel));
    }
    if (opts.refLabel) {
      s.appendChild(el('text', { class: 'note', x: labelW, y: 10 }, opts.refLabel));
    }
    return s;
  }

  function mount(id, node, title) {
    var host = document.getElementById(id);
    if (!host) return;
    if (title) node.insertBefore(el('title', {}, title), node.firstChild);
    host.appendChild(node);
  }

  global.Chart = {
    smallMultiples: smallMultiples,
    dumbbell: dumbbell,
    scatter: scatter,
    profile: profile,
    indexPanels: indexPanels,
    rowChart: rowChart,
    mount: mount,
    colourOf: colourOf
  };
})(window);
