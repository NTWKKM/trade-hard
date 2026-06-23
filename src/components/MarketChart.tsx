import { useEffect, useRef } from 'react';
import './MarketChart.css';
import { fetchHistoricalData, fetch24hrTicker, fetchTradingSymbols } from '../utils/marketData';
import type { KLineResult, Ticker24hrResult } from '../utils/marketData';
import { rainbowMaIndicator } from '../indicators/rainbowMa';
import { cdcActionZoneIndicator, clearCdcCache } from '../indicators/cdcActionZone.optimized';
import type { KLineData, Indicator } from 'klinecharts';

export default function MarketChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const wrap    = containerRef.current.querySelector('.chart-wrap') as HTMLElement;
    const canvas  = containerRef.current.querySelector('#chart') as HTMLCanvasElement;
    const ctx     = canvas.getContext('2d');
    const loader  = containerRef.current.querySelector('#loader') as HTMLElement;
    if (!ctx || !wrap || !canvas || !loader) return;

    /* ── CONFIG ─────────────────────────────────────────────────────── */
    const CFG = {
      PRICE_W: 76,
      TIME_H:  26,
      GAP:      1,
      RATIO:   { main: .56, vol: .12, macd: .16, rsi: .16 },
      LIMIT:   300,
      CLR: {
        bg0:'#282a36', bg1:'#21222c', bg2:'#44475a', bg3:'#6272a4',
        border:'#44475a', bordeHi:'#6272a4',
        t0:'#f8f8f2', t1:'#e9e9e4', t2:'#6272a4',
        grid:'rgba(248,248,242,.05)',
        up:'#50fa7b', dn:'#ff5555',
        upDim:'rgba(80,250,123,.4)', dnDim:'rgba(255,85,85,.4)',
        macdML:'#8be9fd', macdSL:'#ffb86c',
        histUp:'rgba(80,250,123,.6)', histDn:'rgba(255,85,85,.6)',
        rsi:'#ff79c6',
        obFill:'rgba(255,85,85,.06)', osFill:'rgba(80,250,123,.06)',
        obLine:'rgba(255,85,85,.22)', osLine:'rgba(80,250,123,.22)',
        cross:'rgba(248,248,242,.22)',
        blue:'#bd93f9', blueDim:'rgba(189,147,249,.22)',
      },
    };

    /* ── DOM REFS — cached once, zero per-frame querySelector ───────── */
    const doc     = containerRef.current;
    const elO     = doc.querySelector('#oO')     as HTMLElement;
    const elH     = doc.querySelector('#oH')     as HTMLElement;
    const elL     = doc.querySelector('#oL')     as HTMLElement;
    const elC     = doc.querySelector('#oC')     as HTMLElement;
    const elV     = doc.querySelector('#oV')     as HTMLElement;
    const elChg   = doc.querySelector('#chgVal') as HTMLElement;
    const elPrice = doc.querySelector('#priceVal')  as HTMLElement;
    const elBadge = doc.querySelector('#priceBadge') as HTMLElement;
    const elStSym = doc.querySelector('#stSym')  as HTMLElement;
    const elStBars= doc.querySelector('#stBars') as HTMLElement;

    /* ── STATE ──────────────────────────────────────────────────────── */
    interface BarData  { t: number; o: number; h: number; l: number; c: number; v: number; }
    interface DragState { sx: number; sv: number; }
    interface PinchState { d0: number; vb0: number; }
    interface PaneRect  { x: number; y: number; w: number; h: number; }
    interface DimsState {
      W: number; H: number; cW: number; cH: number;
      main: PaneRect; vol: PaneRect; macd: PaneRect; rsi: PaneRect; px: PaneRect; tx: PaneRect;
    }
    interface IndState {
      ml: Float64Array; sl: Float64Array; hi: Float64Array;
      rsi: Float64Array;
      rainbow?: Record<string, number | null>[];
      cdc?: { signal: number; color: 'Black'|'Green'|'Blue'|'LBlue'|'Red'|'Orange'|'Yellow' }[];
    }

    let bars: BarData[]      = [];
    let symbol    = 'BTCUSDT';
    let tf        = '1h';
    let chartType = 'candle';
    let viewStart = 0;
    let viewBars  = 120;
    let mx = -1, my = -1;
    let drag: DragState | null   = null;
    let pinch: PinchState | null = null;
    let dims: DimsState | null   = null;
    let ind: IndState | null     = null;
    const dpr = window.devicePixelRatio || 1;

    /* ── rAF THROTTLE ───────────────────────────────────────────────── */
    // Multiple events per frame (mousemove, wheel) coalesce into one paint.
    let rafPending = false;
    function scheduleRender() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        render();
      });
    }

    /* ── OFFSCREEN RAINBOW CACHE ─────────────────────────────────────── */
    // Rainbow MA: 64 lines × ~300 points. Only invalidated when view or data changes.
    // On crosshair-only moves we just drawImage() the cache — ~64× fewer path ops.
    let rainbowCache: OffscreenCanvas | null = null;
    let rainbowCacheKey = '';   // encodes viewStart+viewBars+bars.length

    function getRainbowCacheKey() {
      return `${viewStart.toFixed(2)}_${viewBars}_${bars.length}`;
    }

    function invalidateRainbowCache() {
      rainbowCache = null;
      rainbowCacheKey = '';
    }

    function ensureRainbowCache(s: number, e: number, bw: number, mLo: number, mHi: number, main: PaneRect, W: number, H: number) {
      const key = getRainbowCacheKey();
      if (rainbowCache && rainbowCacheKey === key) return;

      // Build (or rebuild) the offscreen layer at physical pixel size.
      const oc  = new OffscreenCanvas(Math.round(W * dpr), Math.round(H * dpr));
      const octx = oc.getContext('2d')!;
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (ind?.rainbow) {
        for (let c = 0; c < 64; c++) {
          const maKey = `ma${c + 1}`;
          octx.strokeStyle = rainbowMaIndicator.styles.lines[c].color;
          octx.lineWidth   = 1;
          octx.lineJoin    = 'round';
          octx.lineCap     = 'round';
          octx.beginPath();
          let moved = false;
          for (let i = s; i < e; i++) {
            const v = ind.rainbow[i]?.[maKey];
            if (v == null || !isFinite(v)) { moved = false; continue; }
            const x = main.x + (i - s + 0.5) * bw;
            const y = toY(v, mLo, mHi, main);
            if (!moved) { octx.moveTo(x, y); moved = true; }
            else          octx.lineTo(x, y);
          }
          octx.stroke();
        }
      }

      rainbowCache    = oc;
      rainbowCacheKey = key;
    }

    /* ── LAYOUT ─────────────────────────────────────────────────────── */
    function resize() {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      computeDims(W, H);
      invalidateRainbowCache();
      render();
    }

    function computeDims(W: number, H: number) {
      const cW = W - CFG.PRICE_W;
      const cH = H - CFG.TIME_H;
      const g  = CFG.GAP;
      const r  = CFG.RATIO;
      const mH = Math.floor(cH * r.main);
      const vH = Math.floor(cH * r.vol);
      const dH = Math.floor(cH * r.macd);
      const rH = cH - mH - vH - dH;
      dims = {
        W, H, cW, cH,
        main: { x:0, y:0,            w:cW, h:mH },
        vol:  { x:0, y:mH+g,         w:cW, h:vH },
        macd: { x:0, y:mH+vH+g*2,    w:cW, h:dH },
        rsi:  { x:0, y:mH+vH+dH+g*3, w:cW, h:rH },
        px:   { x:cW, y:0,            w:CFG.PRICE_W, h:cH },
        tx:   { x:0,  y:cH,           w:W, h:CFG.TIME_H },
      };
    }

    /* ── INDICATOR MATH ─────────────────────────────────────────────── */
    // These inlined Float64Array versions are kept here intentionally:
    // they are ~2× faster than the (number|null)[] variants in maUtils.ts
    // for datasets of 300+ bars (no null checks, contiguous memory layout).
    function ema(src: Float64Array, n: number) {
      const k   = 2 / (n + 1);
      const out = new Float64Array(src.length).fill(NaN);
      let v = NaN;
      for (let i = 0; i < src.length; i++) {
        if (isNaN(v)) {
          if (i < n - 1) continue;
          let s = 0;
          for (let j = i - n + 1; j <= i; j++) s += src[j];
          v = s / n;
        } else {
          v = src[i] * k + v * (1 - k);
        }
        out[i] = v;
      }
      return out;
    }

    function macd(src: Float64Array, fast=12, slow=26, sig=9) {
      const ef = ema(src, fast), es = ema(src, slow);
      const ml = new Float64Array(src.length).fill(NaN);
      for (let i = 0; i < src.length; i++)
        if (!isNaN(ef[i]) && !isNaN(es[i])) ml[i] = ef[i] - es[i];
      const sl = ema(Float64Array.from(ml, v => isNaN(v) ? 0 : v), sig);
      const hi = new Float64Array(src.length).fill(NaN);
      for (let i = 0; i < src.length; i++)
        if (!isNaN(ml[i]) && !isNaN(sl[i])) hi[i] = ml[i] - sl[i];
      return { ml, sl, hi };
    }

    function calcRsi(src: Float64Array, n=14) {
      const out = new Float64Array(src.length).fill(NaN);
      if (src.length < n + 1) return out;
      let ag = 0, al = 0;
      for (let i = 1; i <= n; i++) {
        const d = src[i] - src[i-1];
        if (d > 0) ag += d; else al -= d;
      }
      ag /= n; al /= n;
      out[n] = 100 - 100 / (1 + ag / (al || 1e-9));
      for (let i = n + 1; i < src.length; i++) {
        const d = src[i] - src[i-1];
        ag = (ag*(n-1) + Math.max(d, 0)) / n;
        al = (al*(n-1) + Math.max(-d, 0)) / n;
        out[i] = 100 - 100 / (1 + ag / (al || 1e-9));
      }
      return out;
    }

    function computeIndicators() {
      const closes  = Float64Array.from(bars, b => b.c);
      const klineData: KLineData[] = bars.map(b => ({
        timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c,
        volume: b.v, turnover: 0,
      }));

      const rainbowData = rainbowMaIndicator.calc(
        klineData,
        { calcParams: rainbowMaIndicator.calcParams } as unknown as Indicator<Record<string, number | null>>
      );
      const cdcData = cdcActionZoneIndicator.calc(
        klineData,
        { name: `CDCActionZone-${symbol}`, calcParams: cdcActionZoneIndicator.calcParams } as unknown as Indicator<{ signal: number; color: 'Black'|'Green'|'Blue'|'LBlue'|'Red'|'Orange'|'Yellow' }>
      );

      ind = { ...macd(closes), rsi: calcRsi(closes, 14), rainbow: rainbowData, cdc: cdcData };
      invalidateRainbowCache();
    }

    /* ── DRAW HELPERS ───────────────────────────────────────────────── */
    const isOK = (v: number) => isFinite(v) && !isNaN(v);
    const toY  = (v: number, lo: number, hi: number, p: PaneRect) =>
      p.y + (1 - (v - lo) / (hi - lo || 1)) * p.h;

    function grid(p: PaneRect, lo: number, hi: number, ticks: number) {
      ctx!.strokeStyle = CFG.CLR.grid;
      ctx!.lineWidth   = 1;
      const step = (hi - lo) / ticks;
      for (let i = 0; i <= ticks; i++) {
        const y = toY(lo + i * step, lo, hi, p);
        if (y < p.y - 1 || y > p.y + p.h + 1) continue;
        ctx!.beginPath();
        ctx!.moveTo(p.x, y);
        ctx!.lineTo(p.x + p.w, y);
        ctx!.stroke();
      }
    }

    function dashedH(x1: number, y: number, x2: number, color: string, dash=[4,5]) {
      ctx!.save();
      ctx!.strokeStyle = color;
      ctx!.lineWidth   = 1;
      ctx!.setLineDash(dash);
      ctx!.beginPath();
      ctx!.moveTo(x1, y);
      ctx!.lineTo(x2, y);
      ctx!.stroke();
      ctx!.restore();
    }

    function seriesLine(data: Float64Array, s: number, e: number, bw: number, p: PaneRect, lo: number, hi: number, color: string, lw=1.5) {
      ctx!.strokeStyle = color;
      ctx!.lineWidth   = lw;
      ctx!.lineJoin    = 'round';
      ctx!.lineCap     = 'round';
      ctx!.beginPath();
      let moved = false;
      for (let i = s; i < e; i++) {
        const v = data[i];
        if (!isOK(v)) { moved = false; continue; }
        const x = p.x + (i - s + 0.5) * bw;
        const y = toY(v, lo, hi, p);
        if (!moved) { ctx!.moveTo(x, y); moved = true; }
        else          ctx!.lineTo(x, y);
      }
      ctx!.stroke();
    }

    function paneTag(p: PaneRect, txt: string, color='#4a5070') {
      ctx!.font      = '10px monospace';
      ctx!.fillStyle = color;
      ctx!.textAlign = 'left';
      ctx!.fillText(txt, p.x + 6, p.y + 13);
    }

    function rRect(x: number, y: number, w: number, h: number, r: number) {
      ctx!.beginPath();
      if (typeof ctx!.roundRect === 'function') {
        ctx!.roundRect(x, y, w, h, r);
      } else {
        ctx!.moveTo(x+r,y); ctx!.arcTo(x+w,y,x+w,y+h,r);
        ctx!.arcTo(x+w,y+h,x,y+h,r); ctx!.arcTo(x,y+h,x,y,r);
        ctx!.arcTo(x,y,x+w,y,r); ctx!.closePath();
      }
    }

    function getTfMs(tfStr: string) {
      const unit = tfStr.slice(-1);
      const val = parseInt(tfStr);
      switch(unit) {
        case 'm': return val * 60000;
        case 'h': return val * 3600000;
        case 'd': return val * 86400000;
        case 'w': return val * 604800000;
        case 'M': return val * 2592000000;
      }
      return 60000;
    }

    /* ── FORMAT ─────────────────────────────────────────────────────── */
    function fmtP(v: number) {
      if (!v || !isOK(v)) return '—';
      if (v >= 10000) return v.toLocaleString('en', { maximumFractionDigits:1 });
      if (v >= 100)   return v.toLocaleString('en', { minimumFractionDigits:2, maximumFractionDigits:2 });
      if (v >= 1)     return v.toFixed(4);
      return v.toFixed(6);
    }

    function fmtV(v: number) {
      if (v >= 1e9) return (v/1e9).toFixed(2) + 'B';
      if (v >= 1e6) return (v/1e6).toFixed(2) + 'M';
      if (v >= 1e3) return (v/1e3).toFixed(1) + 'K';
      return v.toFixed(2);
    }

    function fmtT(ts: number) {
      const d = new Date(ts);
      const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Bangkok' };
      if (['1d','3d','1w','1M'].includes(tf)) {
        opts.month = 'short'; opts.day = 'numeric';
        return d.toLocaleDateString('en', opts);
      } else {
        opts.hour = '2-digit'; opts.minute = '2-digit'; opts.hour12 = false;
        return d.toLocaleTimeString('en', opts);
      }
    }

    /* ── MAIN RENDER ────────────────────────────────────────────────── */
    const CDC_COLOR: Record<string, string> = {
      Black: 'rgba(98, 114, 164, 0.25)',
      Green: '#50fa7b', Blue: '#bd93f9', LBlue: '#8be9fd',
      Red: '#ff5555', Orange: '#ffb86c', Yellow: '#f1fa8c',
    };

    function render() {
      if (!bars.length || !dims || !ind) return;
      const { W, H, cW, cH, main, vol, macd: md, rsi: rs, px, tx } = dims;
      const C = CFG.CLR;

      const s   = Math.max(0, Math.floor(viewStart));
      const e   = Math.min(bars.length, s + Math.ceil(viewBars) + 1);
      const vis = bars.slice(s, e);
      const n   = vis.length;
      if (!n) return;

      const bw = main.w / viewBars;
      const cw = Math.max(1, bw * 0.72);

      let lo0 = vis[0].l, hi0 = vis[0].h;
      for (const b of vis) { if (b.l < lo0) lo0=b.l; if (b.h > hi0) hi0=b.h; }
      const pad = (hi0 - lo0) * 0.07 || hi0 * 0.01;
      const mLo = lo0 - pad, mHi = hi0 + pad;

      /* ── background ── */
      ctx!.fillStyle = C.bg0;
      ctx!.fillRect(0, 0, W, H);

      grid(main, mLo, mHi, 5);

      /* ── rainbow MA — blit from offscreen cache ── */
      ensureRainbowCache(s, e, bw, mLo, mHi, main, W, H);
      if (rainbowCache) {
        ctx!.drawImage(rainbowCache, 0, 0, W, H);
      }

      /* ── candles / lines ── */
      let maxVol = 0;
      for (const b of vis) if (b.v > maxVol) maxVol = b.v;

      if (chartType === 'line' || chartType === 'vol-line') {
        let prevX = -1, prevY = -1;
        for (let i = 0; i < n; i++) {
          const b  = vis[i];
          const x  = main.x + (i + 0.5) * bw;
          const yC = toY(b.c, mLo, mHi, main);
          if (chartType === 'line') {
            if (i === 0) { ctx!.beginPath(); ctx!.moveTo(x, yC); }
            else           ctx!.lineTo(x, yC);
          } else {
            if (i > 0) {
              const volRatio = maxVol > 0 ? b.v / maxVol : 0;
              ctx!.strokeStyle = b.c >= vis[i-1].c ? C.up : C.dn;
              ctx!.lineWidth   = 1 + (volRatio * 8);
              ctx!.lineCap     = 'round';
              ctx!.beginPath(); ctx!.moveTo(prevX, prevY); ctx!.lineTo(x, yC); ctx!.stroke();
            }
          }
          prevX = x; prevY = yC;
        }
        if (chartType === 'line') {
          ctx!.strokeStyle = C.blue;
          ctx!.lineWidth   = 2;
          ctx!.lineJoin    = 'round';
          ctx!.lineCap     = 'round';
          ctx!.stroke();
        }
      }

      if (chartType === 'candle' || chartType === 'vol-candle') {
        for (let i = 0; i < n; i++) {
          const b  = vis[i];
          const up = b.c >= b.o;
          // Snap to 0.5px grid to eliminate subpixel wick blur on non-retina.
          const x  = Math.round(main.x + (i + 0.5) * bw) + 0.5;
          const yH = Math.round(toY(b.h, mLo, mHi, main));
          const yL = Math.round(toY(b.l, mLo, mHi, main));
          const yO = toY(b.o, mLo, mHi, main);
          const yC = toY(b.c, mLo, mHi, main);
          const cl = up ? C.up : C.dn;

          let drawCw = cw;
          if (chartType === 'vol-candle') {
            const volRatio = maxVol > 0 ? b.v / maxVol : 0;
            drawCw = Math.max(1, bw * 0.9 * volRatio);
          }

          // Wick
          ctx!.strokeStyle = cl;
          ctx!.lineWidth   = Math.max(1, bw < 6 ? 1 : 1.5);
          ctx!.beginPath(); ctx!.moveTo(x, yH); ctx!.lineTo(x, yL); ctx!.stroke();

          // Body
          const by = Math.min(yO, yC);
          const bh = Math.max(1, Math.abs(yC - yO));
          ctx!.fillStyle = cl;
          ctx!.fillRect(x - drawCw/2, by, drawCw, bh);

          // Hollow up-candle body
          if (up && drawCw > 3) {
            ctx!.fillStyle = C.bg0;
            ctx!.fillRect(x - drawCw/2 + 1, by + 1, drawCw - 2, Math.max(0, bh - 2));
          }
        }
      }

      /* ── CDC ribbon — continuous strip at bottom of main pane ── */
      if (ind.cdc) {
        const ribbonH = 6;
        const ribbonY = main.y + main.h - ribbonH;
        for (let i = 0; i < n; i++) {
          const entry = ind.cdc[s + i];
          if (!entry) continue;
          const col = CDC_COLOR[entry.color];
          if (!col) continue;
          // Full bar-width (no gaps) for a clean continuous ribbon.
          ctx!.fillStyle = col;
          ctx!.fillRect(main.x + i * bw, ribbonY, Math.ceil(bw + 0.5), ribbonH);
        }
      }

      /* ── volume ── */
      grid(vol, 0, maxVol, 2);
      for (let i = 0; i < n; i++) {
        const b  = vis[i];
        const up = b.c >= b.o;
        const bh = (b.v / maxVol) * vol.h;
        ctx!.fillStyle = up ? C.upDim : C.dnDim;
        ctx!.fillRect(vol.x + i * bw, vol.y + vol.h - bh, Math.max(1, bw * 0.82), bh);
      }
      paneTag(vol, 'VOL', C.t2);

      /* ── MACD ── */
      const visML = Array.from(ind.ml).slice(s, e) as number[];
      const visSL = Array.from(ind.sl).slice(s, e) as number[];
      const visHI = Array.from(ind.hi).slice(s, e) as number[];
      const allM  = [...visML, ...visSL, ...visHI].filter(isOK);

      if (allM.length) {
        const dLo = Math.min(...allM), dHi = Math.max(...allM);
        const dp  = Math.max((dHi - dLo) * 0.12, 0.0001);
        const mlo = dLo - dp, mhi2 = dHi + dp;

        grid(md, mlo, mhi2, 2);
        dashedH(md.x, toY(0, mlo, mhi2, md), md.x + md.w, C.border);

        for (let i = 0; i < n; i++) {
          const h = visHI[i];
          if (!isOK(h)) continue;
          const y0 = toY(0, mlo, mhi2, md);
          const y1 = toY(h, mlo, mhi2, md);
          ctx!.fillStyle = h >= 0 ? C.histUp : C.histDn;
          ctx!.fillRect(md.x + i*bw, Math.min(y0,y1), Math.max(1, bw*.82), Math.abs(y1-y0));
        }
        seriesLine(ind.ml, s, e, bw, md, mlo, mhi2, C.macdML, 1.5);
        seriesLine(ind.sl, s, e, bw, md, mlo, mhi2, C.macdSL, 1.5);
        paneTag(md, 'MACD (12, 26, 9)', C.t2);
      }

      /* ── RSI ── */
      const rLo = 0, rHi = 100;
      const y70 = toY(70, rLo, rHi, rs);
      const y50 = toY(50, rLo, rHi, rs);
      const y30 = toY(30, rLo, rHi, rs);

      ctx!.fillStyle = C.obFill;
      ctx!.fillRect(rs.x, rs.y, rs.w, y70 - rs.y);
      ctx!.fillStyle = C.osFill;
      ctx!.fillRect(rs.x, y30, rs.w, rs.y + rs.h - y30);

      dashedH(rs.x, y70, rs.x + rs.w, C.obLine, [3,5]);
      dashedH(rs.x, y50, rs.x + rs.w, C.border,  [3,5]);
      dashedH(rs.x, y30, rs.x + rs.w, C.osLine,  [3,5]);

      ctx!.font      = '9px monospace';
      ctx!.textAlign = 'left';
      ctx!.fillStyle = 'rgba(240,84,79,.45)';  ctx!.fillText('70', rs.x+4, y70-2);
      ctx!.fillStyle = C.t2;                   ctx!.fillText('50', rs.x+4, y50-2);
      ctx!.fillStyle = 'rgba(38,198,160,.45)'; ctx!.fillText('30', rs.x+4, y30-2);

      seriesLine(ind.rsi, s, e, bw, rs, rLo, rHi, C.rsi, 1.5);
      paneTag(rs, 'RSI (14)', C.t2);

      /* ── pane separators ── */
      ctx!.strokeStyle = 'rgba(255,255,255,.05)';
      ctx!.lineWidth = 1;
      for (const p of [vol, md, rs]) {
        ctx!.beginPath(); ctx!.moveTo(0, p.y); ctx!.lineTo(cW, p.y); ctx!.stroke();
      }

      /* ── price axis ── */
      ctx!.fillStyle = C.bg1;
      ctx!.fillRect(px.x, px.y, px.w, px.h);
      ctx!.strokeStyle = C.border;
      ctx!.lineWidth = 1;
      ctx!.beginPath(); ctx!.moveTo(px.x, 0); ctx!.lineTo(px.x, cH); ctx!.stroke();

      ctx!.font      = '10px monospace';
      ctx!.fillStyle = C.t1;
      ctx!.textAlign = 'right';
      const TICKS = 5;
      const pStep = (mHi - mLo) / TICKS;
      for (let i = 0; i <= TICKS; i++) {
        const v = mLo + i * pStep;
        const y = toY(v, mLo, mHi, main);
        if (y < main.y + 2 || y > main.y + main.h - 2) continue;
        ctx!.fillText(fmtP(v), W - 4, y + 3);
        ctx!.strokeStyle = C.border;
        ctx!.lineWidth = 1;
        ctx!.beginPath(); ctx!.moveTo(px.x, y); ctx!.lineTo(px.x+4, y); ctx!.stroke();
      }

      /* ── last price badge ── */
      const last = bars[bars.length-1];
      if (last) {
        const lp = last.c;
        const ly = toY(lp, mLo, mHi, main);
        if (ly > main.y + 1 && ly < main.y + main.h - 1) {
          const bc = last.c >= last.o ? C.up : C.dn;
          dashedH(0, ly, px.x, bc + '55', [4,4]);
          rRect(px.x+3, ly-10, px.w-6, 20, 4);
          ctx!.fillStyle = bc;
          ctx!.fill();
          ctx!.fillStyle = '#000';
          ctx!.font      = 'bold 11px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText(fmtP(lp), px.x + px.w/2, ly+4);

          const rem = Math.max(0, last.t + getTfMs(tf) - Date.now());
          if (rem > 0 && rem < 86400000) {
            const hh = Math.floor(rem / 3600000).toString().padStart(2, '0');
            const mm = Math.floor((rem % 3600000) / 60000).toString().padStart(2, '0');
            const ss = Math.floor((rem % 60000) / 1000).toString().padStart(2, '0');
            const text = hh === '00' ? `${mm}:${ss}` : `${hh}:${mm}:${ss}`;
            ctx!.fillStyle = C.t1;
            ctx!.font = '10px monospace';
            ctx!.fillText(text, px.x + px.w/2, ly + 22);
          }
        }
      }

      /* ── time axis ── */
      ctx!.fillStyle = C.bg1;
      ctx!.fillRect(tx.x, tx.y, tx.w, tx.h);
      ctx!.strokeStyle = C.border;
      ctx!.lineWidth = 1;
      ctx!.beginPath(); ctx!.moveTo(0, tx.y); ctx!.lineTo(cW, tx.y); ctx!.stroke();

      ctx!.font      = '10px monospace';
      ctx!.fillStyle = C.t1;
      ctx!.textAlign = 'center';
      const tStep = Math.max(1, Math.floor(n / 6));
      for (let i = 0; i < n; i += tStep) {
        const x = main.x + (i + 0.5) * bw;
        ctx!.fillText(fmtT(vis[i].t), x, cH + 17);
      }

      /* ── crosshair ── */
      if (mx >= 0 && my >= 0 && mx < cW && my < cH) {
        ctx!.strokeStyle = C.cross;
        ctx!.lineWidth   = 1;
        ctx!.setLineDash([4, 4]);
        ctx!.beginPath(); ctx!.moveTo(mx, 0); ctx!.lineTo(mx, cH); ctx!.stroke();
        ctx!.beginPath(); ctx!.moveTo(0, my); ctx!.lineTo(cW, my); ctx!.stroke();
        ctx!.setLineDash([]);

        const bi  = Math.max(0, Math.min(n-1, Math.floor((mx - main.x) / bw)));
        const bar = vis[bi];
        if (bar) setOHLCV(bar);

        let yLabel: string | null = null;
        if (my >= main.y && my < main.y + main.h) {
          yLabel = fmtP(mHi - (my - main.y) / main.h * (mHi - mLo));
        } else if (my >= rs.y && my < rs.y + rs.h) {
          yLabel = (100 - (my - rs.y) / rs.h * 100).toFixed(1);
        } else if (my >= md.y && my < md.y + md.h) {
          const mv = visML[bi];
          if (isOK(mv)) yLabel = mv.toFixed(4);
        }

        if (yLabel) {
          rRect(px.x+2, my-10, px.w-4, 20, 3);
          ctx!.fillStyle   = C.bg3;
          ctx!.fill();
          ctx!.strokeStyle = C.bordeHi;
          ctx!.lineWidth   = 1;
          ctx!.stroke();
          ctx!.fillStyle   = C.t0;
          ctx!.font        = '10px monospace';
          ctx!.textAlign   = 'center';
          ctx!.fillText(yLabel, px.x + px.w/2, my+4);
        }

        if (bar) {
          const lw2 = 86, lh2 = 18;
          const lx  = Math.max(0, Math.min(cW - lw2, mx - lw2/2));
          rRect(lx, cH+1, lw2, lh2, 3);
          ctx!.fillStyle   = C.bg3;
          ctx!.fill();
          ctx!.strokeStyle = C.bordeHi;
          ctx!.lineWidth   = 1;
          ctx!.stroke();
          ctx!.fillStyle   = C.t0;
          ctx!.font        = '10px monospace';
          ctx!.textAlign   = 'center';
          ctx!.fillText(fmtT(bar.t), lx + lw2/2, cH + 13);
        }
      }
    }

    /* ── OHLCV DISPLAY — writes to cached DOM refs (no querySelector) ── */
    function setOHLCV(b: BarData) {
      const chg = (b.c - b.o) / b.o * 100;
      const up  = chg >= 0;
      if (elO) elO.textContent = fmtP(b.o);
      if (elH) elH.textContent = fmtP(b.h);
      if (elL) elL.textContent = fmtP(b.l);
      if (elC) elC.textContent = fmtP(b.c);
      if (elV) elV.textContent = fmtV(b.v);
      if (elChg) {
        elChg.textContent = `${up?'+':''}${chg.toFixed(2)}%`;
        elChg.style.color = up ? 'var(--up)' : 'var(--dn)';
      }
    }

    /* ── DATA FETCH ─────────────────────────────────────────────────── */
    let prevSymbol = symbol;
    let ws: WebSocket | null = null;

    function closeWebSocket() {
      if (ws) {
        ws.close();
        ws = null;
      }
    }

    function openWebSocket() {
      closeWebSocket();
      const wsSymbol = symbol.toLowerCase();
      const stream = `${wsSymbol}@kline_${tf}/${wsSymbol}@ticker`;
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${stream}`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        const payload = msg.data;

        // Kline update — update last bar or append new
        if (payload?.e === 'kline') {
          const k = payload.k;
          const newBar: BarData = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
          if (bars.length && bars[bars.length - 1].t === k.t) {
            bars[bars.length - 1] = newBar;
          } else if (k.x) {
            bars.push(newBar);
            // Keep within LIMIT
            if (bars.length > CFG.LIMIT) bars.shift();
            viewStart = Math.max(0, Math.min(bars.length - viewBars * 0.8, viewStart));
          }
          if (elStBars) elStBars.textContent = `${bars.length} bars`;
          if (bars.length) setOHLCV(bars[bars.length - 1]);
          scheduleRender();
        }

        // Ticker update — update price + badge
        if (payload?.e === '24hrTicker') {
          const last = bars[bars.length - 1];
          if (last) {
            const chg = parseFloat(payload.P);
            const up = chg >= 0;
            if (elPrice) {
              elPrice.textContent = fmtP(last.c);
              elPrice.className = up ? 'col-up' : 'col-dn';
            }
            if (elBadge) {
              elBadge.textContent = `${up ? '+' : ''}${chg.toFixed(2)}%`;
              elBadge.className = up ? 'badge-up' : 'badge-dn';
            }
          }
        }
      };
      ws.onerror = () => { /* silent — historical data already loaded */ };
    }

    async function load() {
      loader.style.display = 'flex';
      const txt = loader.querySelector('.loader-txt') as HTMLElement;
      const retryBtn = loader.querySelector('.retry-btn') as HTMLElement;
      if (txt) txt.textContent = 'Fetching market data…';
      if (retryBtn) retryBtn.style.display = 'none';

      // Clear CDC cache when symbol changes
      if (prevSymbol !== symbol) {
        clearCdcCache();
        prevSymbol = symbol;
      }

      // Close any existing WebSocket before loading new data
      closeWebSocket();

      try {
        const rawBars = await fetchHistoricalData(symbol, tf, CFG.LIMIT);

        bars = rawBars.map((k: KLineResult) => ({
          t: k.timestamp, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
        }));

        viewBars  = Math.min(120, bars.length);
        viewStart = Math.max(0, bars.length - viewBars * 0.8);
        computeIndicators(); // also calls invalidateRainbowCache()

        if (!dims) { const W=wrap.clientWidth, H=wrap.clientHeight; computeDims(W,H); }
        render();

        if (elStSym)  elStSym.textContent  = `${symbol.replace('USDT','/USDT')} · ${tf.toUpperCase()} · Binance`;
        if (elStBars) elStBars.textContent = `${bars.length} bars`;
        if (bars.length) setOHLCV(bars[bars.length-1]);

        // Ticker is non-blocking — fetch separately, don't hold up the chart
        fetch24hrTicker(symbol).then(updateTopBar).catch(() => { /* non-fatal */ });

        // Open WebSocket for real-time updates
        openWebSocket();

        loader.style.display = 'none';
      } catch(err: unknown) {
        if (txt) txt.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        if (retryBtn) retryBtn.style.display = 'block';
        return;
      }
    }

    function updateTopBar(tickerData?: Ticker24hrResult) {
      if (!bars.length || !tickerData) return;
      const last = bars[bars.length-1];
      const chg  = parseFloat(tickerData.priceChangePercent);
      const up   = chg >= 0;
      if (elPrice) {
        elPrice.textContent = fmtP(last.c);
        elPrice.className   = up ? 'col-up' : 'col-dn';
      }
      if (elBadge) {
        elBadge.textContent = `${up?'+':''}${chg.toFixed(2)}%`;
        elBadge.className   = up ? 'badge-up' : 'badge-dn';
      }
    }

    /* ── CLAMP ──────────────────────────────────────────────────────── */
    function clampView() {
      viewBars  = Math.max(20, Math.min(bars.length, viewBars));
      const maxScroll = bars.length - viewBars * 0.8;
      viewStart = Math.max(0, Math.min(maxScroll, viewStart));
    }

    /* ── EVENT HANDLERS ─────────────────────────────────────────────── */
    const handleMouseMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      if (drag && dims) {
        const bw = dims.main.w / viewBars;
        viewStart = drag.sv - (e.clientX - drag.sx) / bw;
        clampView();
        invalidateRainbowCache();
      }
      scheduleRender();
    };

    const handleMouseLeave = () => {
      mx = -1; my = -1;
      scheduleRender();
      if (bars.length) setOHLCV(bars[bars.length-1]);
    };

    const handleMouseDown = (e: MouseEvent) => {
      drag = { sx: e.clientX, sv: viewStart };
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseUp = () => {
      drag = null;
      canvas.style.cursor = 'crosshair';
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!dims) return;
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      const prev   = viewBars;
      viewBars     = Math.round(viewBars * factor);
      const ratio  = mx >= 0 ? (mx - dims.main.x) / dims.main.w : 0.5;
      viewStart    += (prev - viewBars) * ratio;
      clampView();
      invalidateRainbowCache();
      scheduleRender();
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        drag = { sx: t.clientX, sv: viewStart };
        const r = canvas.getBoundingClientRect();
        mx = t.clientX - r.left;
        my = t.clientY - r.top;
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinch = { d0: Math.hypot(dx, dy), vb0: viewBars };
        drag = null;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && drag && dims) {
        const t  = e.touches[0];
        const r  = canvas.getBoundingClientRect();
        mx = t.clientX - r.left;
        my = t.clientY - r.top;
        const bw = dims.main.w / viewBars;
        viewStart = drag.sv - (t.clientX - drag.sx) / bw;
        clampView();
        invalidateRainbowCache();
        scheduleRender();
      } else if (e.touches.length === 2 && pinch) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        viewBars   = Math.round(pinch.vb0 * (pinch.d0 / Math.hypot(dx, dy)));
        clampView();
        invalidateRainbowCache();
        scheduleRender();
      }
    };

    const handleTouchEnd = () => {
      drag = pinch = null;
      mx = -1; my = -1;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!bars.length) return;
      if (e.key === 'r' || e.key === 'R') {
        viewBars  = Math.min(120, bars.length);
        viewStart = Math.max(0, bars.length - viewBars * 0.8);
        invalidateRainbowCache();
        scheduleRender();
      }
      if (e.key === 'ArrowLeft')  { viewStart = Math.max(0, viewStart - Math.ceil(viewBars*0.1)); invalidateRainbowCache(); scheduleRender(); }
      if (e.key === 'ArrowRight') { viewStart = Math.min(bars.length - viewBars * 0.8, viewStart + Math.ceil(viewBars*0.1)); invalidateRainbowCache(); scheduleRender(); }
      if (e.key === '+') { viewBars = Math.max(20, Math.round(viewBars * 0.85)); clampView(); invalidateRainbowCache(); scheduleRender(); }
      if (e.key === '-') { viewBars = Math.min(bars.length, Math.round(viewBars * 1.18)); clampView(); invalidateRainbowCache(); scheduleRender(); }
    };

    canvas.addEventListener('mousemove',  handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mousedown',  handleMouseDown);
    window.addEventListener('mouseup',    handleMouseUp);
    canvas.addEventListener('wheel',      handleWheel, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   handleTouchEnd);
    window.addEventListener('keydown',    handleKeyDown);

    /* ── SYMBOL SEARCH ──────────────────────────────────────────────── */
    const symSearch = containerRef.current.querySelector('#symSearch') as HTMLInputElement;
    const symDropdown = containerRef.current.querySelector('#symDropdown') as HTMLElement;
    const starBtn = containerRef.current.querySelector('#starBtn') as HTMLElement;
    let tradingSymbols: { symbol: string; base: string; quote: string }[] = [];
    let symDropdownItems: { symbol: string; base: string; fav: boolean }[] = [];
    let symDropdownIdx = -1;

    // Favorites — persisted in localStorage
    function getFavs(): string[] {
      try { return JSON.parse(localStorage.getItem('trade-hard-favs') || '[]'); }
      catch { return []; }
    }
    function isFav(sym: string): boolean {
      return getFavs().includes(sym);
    }
    function toggleFav(sym: string) {
      const favs = getFavs();
      const idx = favs.indexOf(sym);
      if (idx >= 0) favs.splice(idx, 1);
      else favs.push(sym);
      localStorage.setItem('trade-hard-favs', JSON.stringify(favs));
      updateStarBtn();
    }
    function updateStarBtn() {
      if (starBtn) {
        starBtn.classList.toggle('starred', isFav(symbol));
        starBtn.textContent = isFav(symbol) ? '★' : '☆';
      }
    }

    // Fetch trading symbols once at init
    fetchTradingSymbols().then(syms => {
      tradingSymbols = syms;
    }).catch(() => { /* fallback to manual entry */ });

    function renderSymDropdown(filter: string) {
      const q = filter.toUpperCase().trim();
      const favs = getFavs();

      // Build favorites section first (always shown at top)
      const favItems = favs
        .map(sym => {
          const match = tradingSymbols.find(t => t.symbol === sym);
          return match ? { symbol: match.symbol, base: match.base, fav: true } : { symbol: sym, base: sym.replace('USDT', ''), fav: true };
        })
        .filter(item => !q || item.symbol.includes(q) || item.base.includes(q));

      // Then regular items (excluding favorites)
      const regularFiltered = q
        ? tradingSymbols
            .filter(s => !favs.includes(s.symbol) && (s.symbol.includes(q) || s.base.includes(q)))
            .slice(0, 50)
        : tradingSymbols.filter(s => !favs.includes(s.symbol)).slice(0, 50);

      const allItems = [...favItems, ...regularFiltered.map(s => ({ symbol: s.symbol, base: s.base, fav: false }))];
      symDropdownItems = allItems;
      symDropdownIdx = -1;

      let html = '';
      if (favItems.length) {
        html += '<div class="sym-fav-header">★ Favorites</div>';
        html += favItems.map((item, i) =>
          `<div class="sym-item fav" data-symbol="${item.symbol}" data-idx="${i}">
            <span class="sym-star" data-star="${item.symbol}">★</span>
            ${item.base}<span class="sym-quote">/USDT</span>
          </div>`
        ).join('');
        if (regularFiltered.length) html += '<div class="sym-sep"></div>';
      }
      const offset = favItems.length + (favItems.length && regularFiltered.length ? 1 : 0);
      html += regularFiltered.map((s, i) =>
        `<div class="sym-item" data-symbol="${s.symbol}" data-idx="${offset + i}">
          <span class="sym-star" data-star="${s.symbol}">☆</span>
          ${s.base}<span class="sym-quote">/USDT</span>
        </div>`
      ).join('');

      symDropdown.innerHTML = html;
      symDropdown.style.display = symDropdownItems.length ? 'block' : 'none';
    }

    const handleSymSearch = () => {
      const val = symSearch.value.toUpperCase().trim();
      if (!val) { renderSymDropdown(''); return; }
      renderSymDropdown(val);
    };

    const handleSymKeydown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        symDropdownIdx = Math.min(symDropdownItems.length - 1, symDropdownIdx + 1);
        updateSymHighlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        symDropdownIdx = Math.max(-1, symDropdownIdx - 1);
        updateSymHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (symDropdownIdx >= 0 && symDropdownItems[symDropdownIdx]) {
          selectSymbol(symDropdownItems[symDropdownIdx].symbol);
        } else {
          const val = symSearch.value.toUpperCase().trim();
          if (val) selectSymbol(val.endsWith('USDT') ? val : val + 'USDT');
        }
      } else if (e.key === 'Escape') {
        symDropdown.style.display = 'none';
      }
    };

    function updateSymHighlight() {
      symDropdown.querySelectorAll('.sym-item').forEach((el, i) => {
        el.classList.toggle('active', i === symDropdownIdx);
      });
      const active = symDropdown.querySelector('.sym-item.active') as HTMLElement;
      if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function selectSymbol(sym: string) {
      symbol = sym;
      symSearch.value = sym;
      symDropdown.style.display = 'none';
      updateStarBtn();
      load();
    }

    const handleSymDropdownClick = (e: Event) => {
      const starEl = (e.target as HTMLElement).closest('.sym-star') as HTMLElement;
      if (starEl) {
        e.stopPropagation();
        const symToToggle = starEl.dataset.star!;
        toggleFav(symToToggle);
        renderSymDropdown(symSearch.value);
        return;
      }
      const item = (e.target as HTMLElement).closest('.sym-item') as HTMLElement;
      if (!item) return;
      selectSymbol(item.dataset.symbol!);
    };

    const handleSymFocus = () => {
      if (tradingSymbols.length) renderSymDropdown(symSearch.value);
    };

    const handleSymBlur = () => {
      // Delay to allow click on dropdown item
      setTimeout(() => { symDropdown.style.display = 'none'; }, 150);
    };

    symSearch.addEventListener('input', handleSymSearch);
    symSearch.addEventListener('keydown', handleSymKeydown);
    symSearch.addEventListener('focus', handleSymFocus);
    symSearch.addEventListener('blur', handleSymBlur);
    symDropdown.addEventListener('click', handleSymDropdownClick);

    // Retry button
    const retryBtnEl = containerRef.current.querySelector('.retry-btn') as HTMLElement;
    const handleRetry = () => { load(); };
    retryBtnEl.addEventListener('click', handleRetry);

    // Star button — toggle current symbol as favorite
    const handleStarClick = () => {
      toggleFav(symbol);
      if (symDropdown.style.display === 'block') renderSymDropdown(symSearch.value);
    };
    starBtn.addEventListener('click', handleStarClick);
    updateStarBtn();

    const tfGroup = containerRef.current.querySelector('#tfGroup');
    const handleTfClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.tf-btn') as HTMLElement;
      if (!btn) return;
      tfGroup?.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      tf = btn.dataset.tf!;
      load();
    };
    tfGroup?.addEventListener('click', handleTfClick);

    const typeGroup = containerRef.current.querySelector('#chartTypeGroup');
    const handleTypeClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.tf-btn') as HTMLElement;
      if (!btn) return;
      typeGroup?.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chartType = btn.dataset.type!;
      scheduleRender();
    };
    typeGroup?.addEventListener('click', handleTypeClick);

    const ro = new ResizeObserver(() => {
      invalidateRainbowCache();
      resize();
    });
    ro.observe(wrap);

    resize();
    load();

    const tickerInterval = setInterval(() => {
      if (bars.length > 0) scheduleRender();
    }, 1000);

    return () => {
      clearInterval(tickerInterval);
      canvas.removeEventListener('mousemove',  handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('mousedown',  handleMouseDown);
      window.removeEventListener('mouseup',    handleMouseUp);
      canvas.removeEventListener('wheel',      handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove',  handleTouchMove);
      canvas.removeEventListener('touchend',   handleTouchEnd);
      window.removeEventListener('keydown',    handleKeyDown);
      symSearch.removeEventListener('input', handleSymSearch);
      symSearch.removeEventListener('keydown', handleSymKeydown);
      symSearch.removeEventListener('focus', handleSymFocus);
      symSearch.removeEventListener('blur', handleSymBlur);
      symDropdown.removeEventListener('click', handleSymDropdownClick);
      retryBtnEl.removeEventListener('click', handleRetry);
      starBtn.removeEventListener('click', handleStarClick);
      tfGroup?.removeEventListener('click',  handleTfClick);
      typeGroup?.removeEventListener('click', handleTypeClick);
      ro.disconnect();
      closeWebSocket();
    };
  }, []);

  return (
    <div className="trade-hard-theme" ref={containerRef}>
      {/* ▸ TOPBAR */}
      <div className="topbar">
        <span className="brand">◈ TRADE-HARD</span>
        <div className="v-sep"></div>

        <div className="sym-search-wrap" id="symSearchWrap">
          <input className="sym-search-input" id="symSearch" type="text" placeholder="Search symbol…" autoComplete="off" defaultValue="BTCUSDT" />
          <button className="star-btn" id="starBtn" title="Add to favorites">☆</button>
          <div className="sym-search-dropdown" id="symDropdown"></div>
        </div>

        <div className="tf-group" id="tfGroup">
          <button className="tf-btn" data-tf="1m">1m</button>
          <button className="tf-btn" data-tf="5m">5m</button>
          <button className="tf-btn" data-tf="15m">15m</button>
          <button className="tf-btn active" data-tf="1h">1H</button>
          <button className="tf-btn" data-tf="4h">4H</button>
          <button className="tf-btn" data-tf="1d">1D</button>
          <button className="tf-btn" data-tf="1w">1W</button>
        </div>

        <div className="v-sep"></div>

        <div className="tf-group" id="chartTypeGroup">
          <button className="tf-btn active" data-type="candle">Candle</button>
          <button className="tf-btn" data-type="vol-candle">Vol Candle</button>
          <button className="tf-btn" data-type="line">Line</button>
          <button className="tf-btn" data-type="vol-line">Vol Line</button>
        </div>

        <div className="price-block">
          <div id="priceVal">—</div>
          <div id="priceBadge" className="badge-up"></div>
        </div>
      </div>

      {/* ▸ SUB-TOOLBAR */}
      <div className="subtoolbar">
        <div className="ind-chips">
          <span className="chip"><span className="dot" style={{background: 'linear-gradient(90deg, red, orange, yellow, green, blue, indigo, violet)'}}></span>Rainbow MA</span>
          <span className="chip"><span className="dot" style={{background: '#00E676'}}></span>CDC ActionZone</span>
          <span className="chip"><span className="dot" style={{background: 'var(--up)', opacity: 0.8}}></span>VOL</span>
          <span className="chip"><span className="dot" style={{background: 'var(--macd-ml)'}}></span>MACD</span>
          <span className="chip"><span className="dot" style={{background: 'var(--rsi)'}}></span>RSI 14</span>
        </div>
        <div className="v-sep"></div>
        <div className="ohlcv-row">
          <span><span className="lbl">O</span><span className="val" id="oO">—</span></span>
          <span><span className="lbl">H</span><span className="val" id="oH">—</span></span>
          <span><span className="lbl">L</span><span className="val" id="oL">—</span></span>
          <span><span className="lbl">C</span><span className="val" id="oC">—</span></span>
          <span><span className="lbl">V</span><span className="val" id="oV">—</span></span>
          <span id="chgVal"></span>
        </div>
      </div>

      {/* ▸ CANVAS */}
      <div className="chart-wrap">
        <canvas id="chart"></canvas>
        <div id="loader">
          <div className="ring"></div>
          <div className="loader-txt">Fetching market data…</div>
          <button className="retry-btn" style={{display:'none'}}>Retry</button>
        </div>
      </div>

      {/* ▸ STATUSBAR */}
      <div className="statusbar">
        <div className="live-dot"></div>
        <span id="stSym">BTC/USDT · Binance</span>
        <span>Scroll = zoom &nbsp;|&nbsp; Drag = pan &nbsp;|&nbsp; R = reset view</span>
        <span id="stBars" style={{marginLeft: 'auto'}}></span>
      </div>
    </div>
  );
}