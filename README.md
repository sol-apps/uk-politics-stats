---
solhann_app: true
slug: uk-politics-stats
title: UK Politics Stats
description: Charts on UK public policy. First: PISA 2025 across the four nations, and whether money explains the gaps.
emoji: 📊
---

# 📊 UK Politics Stats

Charts on UK public policy, built from primary statistical sources. Deliberately general —
education is the first subject, not the only intended one.

**Live:** https://uk-politics-stats.solhann.net
**Gallery:** https://create.solhann.net

## Pages

| Page | What it is |
|---|---|
| `index.html` | Hub, and the three rules the site works to |
| `education.html` | Every PISA result for the four UK nations, 2006–2025, plus the socio-economic quartile breakdown |
| `money.html` | Tests PISA against GDP per head, child poverty and inequality. The answer is a negative result |
| `regions.html` | England's nine regions on Attainment 8 — one policy, nine economies |
| `sources.html` | Every dataset, and what is wrong with each |

## Structure

Static, no build step, no dependencies.

- `assets/data.js` — **generated, not hand-edited.** One object, `window.UKD`, holding every
  figure the site plots. Regenerating it is the way to update the site after a new data release.
- `assets/charts.js` — SVG chart builders: `smallMultiples`, `dumbbell`, `scatter`, `profile`,
  `indexPanels`, `rowChart`. No libraries. Chart conventions are documented at the top of the file.
- `assets/style.css` — the whole sheet. Light-only by deliberate choice; see below.

## Design notes

The house style is Tufte's, applied literally rather than gestured at: no legends (every series is
labelled where it ends), range-frame axes, no gridlines that aren't being read across, one mark per
datum and nothing else.

Two consequences worth knowing before editing:

- **Labels are placed by geometry, not by hand.** `spreadLabels` pushes end-labels apart until none
  overlaps; `placeLabels` tries sixteen positions around each scatter point and takes the first
  that hits nothing, adding a leader line when it has to reach. Per-caller `dy` nudges were removed
  because the next data release invalidates them. If a label collides, fix the placer.
- **The page commits to one light theme.** `color-scheme: light` and a warm `#fffff8` ground, which
  is the palette these charts were calibrated against. It does not follow the system theme.

### Checking a chart

Charts are verified geometrically rather than by eye. Paste this into the browser console on any
page; it reports every pair of overlapping labels, anything painted outside its `viewBox`, and any
horizontal page overflow.

```js
(function(){var p=[];document.querySelectorAll('svg').forEach(function(s,si){var h=s.getBoundingClientRect();if(h.width===0){p.push({svg:si,kind:'zero-size'});return;}var b=[].slice.call(s.querySelectorAll('text')).map(function(t){var r=t.getBoundingClientRect();return{t:t,x:r.left,y:r.top,w:r.width,h:r.height}}).filter(function(q){return q.w>0});for(var i=0;i<b.length;i++)for(var j=i+1;j<b.length;j++){var A=b[i],C=b[j];var ox=Math.min(A.x+A.w,C.x+C.w)-Math.max(A.x,C.x),oy=Math.min(A.y+A.h,C.y+C.h)-Math.max(A.y,C.y);if(ox>1&&oy>1)p.push({svg:si,kind:'overlap',a:A.t.textContent,b:C.t.textContent})}b.forEach(function(B){var o=[];if(B.x<h.left-1)o.push('left');if(B.x+B.w>h.right+1)o.push('right');if(B.y+B.h>h.bottom+1)o.push('bottom');if(o.length)p.push({svg:si,kind:'clipped',text:B.t.textContent,edge:o.join(',')})})});if(document.documentElement.scrollWidth>window.innerWidth+1)p.push({kind:'page-h-scroll'});return p.length?p:'CLEAN'})()
```

Run it in a **visible** window, or from an iframe of a known width. A hidden or
background tab reports `window.innerWidth` as 0 and every element as zero-sized,
which the checker will faithfully report as dozens of clipped labels that are not
there. The `zero-size` result is the tell.

Every page should return `CLEAN`, at desktop and mobile widths.

## Adding a subject

The site is built to grow sideways. A new topic is a new page plus a new key on `window.UKD`, a
row in the `index.html` list, and an entry in `sources.html`. Nothing in `charts.js` is
education-specific.
