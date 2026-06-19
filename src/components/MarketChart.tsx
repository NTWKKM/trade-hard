import { useEffect, useRef } from 'react';
import './MarketChart.css';
import { fetchHistoricalData, fetch24hrTicker } from '../utils/marketData';
import type { KLineResult, Ticker24hrResult } from '../utils/marketData';

export default function MarketChart() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const wrap = containerRef.current.querySelector('.chart-wrap') as HTMLElement;
    const canvas = containerRef.current.querySelector('#chart') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    const loader = containerRef.current.querySelector('#loader') as HTMLElement;
    if (!ctx || !wrap || !canvas || !loader) return;

    /* ── CONFIG ─────────────────────────────────────────────────────── */
    const CFG = {
      PRICE_W:  76,
      TIME_H:   26,
      GAP:       1,
      RATIO:    { main:.56, vol:.12, macd:.16, rsi:.16 },
      LIMIT:   300,
      CLR: {
        bg0:'#0f1117', bg1:'#1a1e2e', bg2:'#242838', bg3:'#2c3044',
        border:'#30354a', bordeHi:'#454c6a',
        t0:'#dde1f0', t1:'#828aaa', t2:'#4a5070',
        grid:'rgba(255,255,255,.04)',
        up:'#26c6a0', dn:'#f0544f',
        upDim:'rgba(38,198,160,.4)', dnDim:'rgba(240,84,79,.4)',
        upFill:'rgba(38,198,160,.18)', dnFill:'rgba(240,84,79,.15)',
        ema9:'#f5a623', ema21:'#6ab4f0',
        macdML:'#4c7cfc', macdSL:'#f5623a',
        histUp:'rgba(38,198,160,.6)', histDn:'rgba(240,84,79,.6)',
        rsi:'#c386f8',
        obFill:'rgba(240,84,79,.06)', osFill:'rgba(38,198,160,.06)',
        obLine:'rgba(240,84,79,.22)', osLine:'rgba(38,198,160,.22)',
        cross:'rgba(180,190,210,.22)',
        blue:'#4c7cfc', blueDim:'rgba(76,124,252,.22)',
      },
    };

    /* ── STATE ──────────────────────────────────────────────────────── */
    interface BarData { t: number; o: number; h: number; l: number; c: number; v: number; }
    interface DragState { sx: number; sv: number; }
    interface PinchState { d0: number; vb0: number; }
    interface PaneRect { x: number; y: number; w: number; h: number; }
    interface DimsState {
      W: number; H: number; cW: number; cH: number;
      main: PaneRect; vol: PaneRect; macd: PaneRect; rsi: PaneRect; px: PaneRect; tx: PaneRect;
    }
    interface IndState {
      e9: Float64Array; e21: Float64Array;
      ml: Float64Array; sl: Float64Array; hi: Float64Array;
      rsi: Float64Array;
    }

    let bars: BarData[]      = [];
    let symbol    = 'BTCUSDT';
    let tf        = '1h';
    let viewStart = 0;
    let viewBars  = 120;
    let mx = -1, my = -1;
    let drag: DragState | null      = null;
    let pinch: PinchState | null     = null;
    let dims: DimsState | null      = null;
    let ind: IndState | null       = null;
    const dpr    = window.devicePixelRatio || 1;

    /* ── LAYOUT ─────────────────────────────────────────────────────── */
    function resize() {
      const W = wrap.clientWidth, H = wrap.clientHeight;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      computeDims(W, H);
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
        px:   { x:cW,y:0,             w:CFG.PRICE_W, h:cH },
        tx:   { x:0, y:cH,            w:W, h:CFG.TIME_H },
      };
    }

    /* ── INDICATOR MATH ─────────────────────────────────────────────── */
    function ema(src: Float64Array, n: number) {
      const k = 2 / (n + 1);
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
      const closes = Float64Array.from(bars, b => b.c);
      ind = {
        e9:  ema(closes, 9),
        e21: ema(closes, 21),
        ...macd(closes),
        rsi: calcRsi(closes, 14),
      };
    }

    /* ── DRAW HELPERS ───────────────────────────────────────────────── */
    const isOK = (v: number) => isFinite(v) && !isNaN(v);
    const toY  = (v: number, lo: number, hi: number, p: PaneRect) => p.y + (1 - (v - lo) / (hi - lo || 1)) * p.h;

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

    /* ── FORMAT ─────────────────────────────────────────────────────── */
    function fmtP(v: number) {
      if (!v || !isOK(v)) return '—';
      if (v >= 10000) return v.toLocaleString('en', {maximumFractionDigits:1});
      if (v >= 100)   return v.toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits:2});
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
      return ['1d','3d','1w','1M'].includes(tf)
        ? d.toLocaleDateString('en',{month:'short',day:'numeric'})
        : d.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',hour12:false});
    }

    /* ── MAIN RENDER ────────────────────────────────────────────────── */
    function render() {
      if (!bars.length || !dims || !ind) return;
      const { W, H, cW, cH, main, vol, macd: md, rsi: rs, px, tx } = dims;
      const C = CFG.CLR;

      const s  = Math.max(0, Math.floor(viewStart));
      const e  = Math.min(bars.length, s + Math.ceil(viewBars) + 1);
      const vis = bars.slice(s, e);
      const n   = vis.length;
      if (!n) return;

      const bw = main.w / n;
      const cw = Math.max(1, bw * 0.72);

      let lo0 = vis[0].l, hi0 = vis[0].h;
      for (const b of vis) { if (b.l < lo0) lo0=b.l; if (b.h > hi0) hi0=b.h; }
      const pad = (hi0 - lo0) * 0.07 || hi0 * 0.01;
      const mLo = lo0 - pad, mHi = hi0 + pad;

      ctx!.fillStyle = C.bg0;
      ctx!.fillRect(0, 0, W, H);

      grid(main, mLo, mHi, 5);

      seriesLine(ind.e9,  s, e, bw, main, mLo, mHi, C.ema9,  1.3);
      seriesLine(ind.e21, s, e, bw, main, mLo, mHi, C.ema21, 1.3);

      for (let i = 0; i < n; i++) {
        const b  = vis[i];
        const up = b.c >= b.o;
        const x  = main.x + (i + 0.5) * bw;
        const yH = toY(b.h, mLo, mHi, main);
        const yL = toY(b.l, mLo, mHi, main);
        const yO = toY(b.o, mLo, mHi, main);
        const yC = toY(b.c, mLo, mHi, main);
        const cl = up ? C.up : C.dn;

        ctx!.strokeStyle = cl;
        ctx!.lineWidth   = Math.max(1, bw < 6 ? 1 : 1.5);
        ctx!.beginPath(); ctx!.moveTo(x, yH); ctx!.lineTo(x, yL); ctx!.stroke();

        const by = Math.min(yO, yC);
        const bh = Math.max(1, Math.abs(yC - yO));
        ctx!.fillStyle = cl;
        ctx!.fillRect(x - cw/2, by, cw, bh);

        if (up && cw > 3) {
          ctx!.fillStyle = C.bg0;
          ctx!.fillRect(x - cw/2 + 1, by + 1, cw - 2, Math.max(0, bh - 2));
          ctx!.fillStyle = cl;
        }
      }

      let maxVol = 0;
      for (const b of vis) if (b.v > maxVol) maxVol = b.v;
      grid(vol, 0, maxVol, 2);

      for (let i = 0; i < n; i++) {
        const b  = vis[i];
        const up = b.c >= b.o;
        const bh = (b.v / maxVol) * vol.h;
        ctx!.fillStyle = up ? C.upDim : C.dnDim;
        ctx!.fillRect(vol.x + i * bw, vol.y + vol.h - bh, Math.max(1, bw * 0.82), bh);
      }
      paneTag(vol, 'VOL', C.t2);

      const visML = Array.from(ind.ml).slice(s, e) as number[];
      const visSL = Array.from(ind.sl).slice(s, e) as number[];
      const visHI = Array.from(ind.hi).slice(s, e) as number[];
      const allM  = [...visML, ...visSL, ...visHI].filter(isOK);

      if (allM.length) {
        const dLo = Math.min(...allM);
        const dHi = Math.max(...allM);
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
      ctx!.fillStyle = C.t2;                  ctx!.fillText('50', rs.x+4, y50-2);
      ctx!.fillStyle = 'rgba(38,198,160,.45)'; ctx!.fillText('30', rs.x+4, y30-2);

      seriesLine(ind.rsi, s, e, bw, rs, rLo, rHi, C.rsi, 1.5);
      paneTag(rs, 'RSI (14)', C.t2);

      ctx!.strokeStyle = 'rgba(255,255,255,.05)';
      ctx!.lineWidth = 1;
      for (const p of [vol, md, rs]) {
        ctx!.beginPath(); ctx!.moveTo(0, p.y); ctx!.lineTo(cW, p.y); ctx!.stroke();
      }

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

      const last = bars[bars.length-1];
      if (last) {
        const lp = last.c;
        const ly = toY(lp, mLo, mHi, main);
        if (ly > main.y + 1 && ly < main.y + main.h - 1) {
          const up  = last.c >= last.o;
          const bc  = up ? C.up : C.dn;
          dashedH(0, ly, px.x, bc + '55', [4,4]);
          rRect(px.x+3, ly-10, px.w-6, 20, 4);
          ctx!.fillStyle = bc;
          ctx!.fill();
          ctx!.fillStyle = '#000';
          ctx!.font      = 'bold 11px monospace';
          ctx!.textAlign = 'center';
          ctx!.fillText(fmtP(lp), px.x + px.w/2, ly+4);
        }
      }

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

      if (mx >= 0 && my >= 0 && mx < cW && my < cH) {
        ctx!.strokeStyle = C.cross;
        ctx!.lineWidth   = 1;
        ctx!.setLineDash([4, 4]);
        ctx!.beginPath(); ctx!.moveTo(mx, 0);  ctx!.lineTo(mx, cH);  ctx!.stroke();
        ctx!.beginPath(); ctx!.moveTo(0, my);  ctx!.lineTo(cW, my);  ctx!.stroke();
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

    /* ── OHLCV DISPLAY ──────────────────────────────────────────────── */
    function setOHLCV(b: BarData) {
      const chg = (b.c - b.o) / b.o * 100;
      const up  = chg >= 0;
      const doc = containerRef.current!;
      const oO = doc.querySelector('#oO');
      const oH = doc.querySelector('#oH');
      const oL = doc.querySelector('#oL');
      const oC = doc.querySelector('#oC');
      const oV = doc.querySelector('#oV');
      const cv = doc.querySelector('#chgVal') as HTMLElement;
      if (oO) oO.textContent = fmtP(b.o);
      if (oH) oH.textContent = fmtP(b.h);
      if (oL) oL.textContent = fmtP(b.l);
      if (oC) oC.textContent = fmtP(b.c);
      if (oV) oV.textContent = fmtV(b.v);
      if (cv) {
        cv.textContent = `${up?'+':''}${chg.toFixed(2)}%`;
        cv.style.color = up ? 'var(--up)' : 'var(--dn)';
      }
    }

    /* ── DATA FETCH ─────────────────────────────────────────────────── */
    async function load() {
      loader.style.display = 'flex';
      try {
        const rawBars = await fetchHistoricalData(symbol, tf, CFG.LIMIT);
        
        bars = rawBars.map((k: KLineResult) => ({
          t: k.timestamp, 
          o: k.open, 
          h: k.high, 
          l: k.low, 
          c: k.close, 
          v: k.volume
        }));
        
        viewBars  = Math.min(120, bars.length);
        viewStart = Math.max(0, bars.length - viewBars);
        computeIndicators();
        
        const tickerData = await fetch24hrTicker(symbol);
        updateTopBar(tickerData);
        
        if (!dims) { const W=wrap.clientWidth,H=wrap.clientHeight; computeDims(W,H); }
        render();
        const stSym = containerRef.current!.querySelector('#stSym');
        const stBars = containerRef.current!.querySelector('#stBars');
        if (stSym) stSym.textContent = `${symbol.replace('USDT','/USDT')} · ${tf.toUpperCase()} · Binance`;
        if (stBars) stBars.textContent = `${bars.length} bars`;
        if (bars.length) setOHLCV(bars[bars.length-1]);
      } catch(err: unknown) {
        const txt = loader.querySelector('.loader-txt');
        if (txt) txt.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
      loader.style.display = 'none';
    }

    function updateTopBar(tickerData?: Ticker24hrResult) {
      if (!bars.length || !tickerData) return;
      const last  = bars[bars.length-1];
      const chg   = parseFloat(tickerData.priceChangePercent);
      const up    = chg >= 0;

      const pv = containerRef.current!.querySelector('#priceVal');
      const pb = containerRef.current!.querySelector('#priceBadge');
      if (pv) {
        pv.textContent = fmtP(last.c);
        pv.className   = up ? 'col-up' : 'col-dn';
      }
      if (pb) {
        pb.textContent = `${up?'+':''}${chg.toFixed(2)}%`;
        pb.className   = up ? 'badge-up' : 'badge-dn';
      }
    }

    /* ── CLAMP HELPERS ──────────────────────────────────────────────── */
    function clampView() {
      viewBars  = Math.max(20, Math.min(bars.length, viewBars));
      viewStart = Math.max(0, Math.min(bars.length - viewBars, viewStart));
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
      }
      render();
    };

    const handleMouseLeave = () => {
      mx = -1; my = -1;
      render();
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
      render();
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        drag  = { sx: t.clientX, sv: viewStart };
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
        render();
      } else if (e.touches.length === 2 && pinch) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX;
        const dy   = e.touches[0].clientY - e.touches[1].clientY;
        const d    = Math.hypot(dx, dy);
        viewBars   = Math.round(pinch.vb0 * (pinch.d0 / d));
        clampView();
        render();
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
        viewStart = Math.max(0, bars.length - viewBars);
        render();
      }
      if (e.key === 'ArrowLeft')  { viewStart = Math.max(0, viewStart - Math.ceil(viewBars*0.1)); render(); }
      if (e.key === 'ArrowRight') { viewStart = Math.min(bars.length - viewBars, viewStart + Math.ceil(viewBars*0.1)); render(); }
      if (e.key === '+') { viewBars = Math.max(20, Math.round(viewBars * 0.85)); clampView(); render(); }
      if (e.key === '-') { viewBars = Math.min(bars.length, Math.round(viewBars * 1.18)); clampView(); render(); }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('keydown', handleKeyDown);

    const symSelect = containerRef.current.querySelector('#symSelect') as HTMLSelectElement;
    const handleSymChange = (e: Event) => {
      symbol = (e.target as HTMLSelectElement).value;
      load();
    };
    symSelect.addEventListener('change', handleSymChange);

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

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);

    resize();
    load();

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('keydown', handleKeyDown);
      symSelect.removeEventListener('change', handleSymChange);
      tfGroup?.removeEventListener('click', handleTfClick);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="astronex-theme" ref={containerRef}>
      {/* ▸ TOPBAR */}
      <div className="topbar">
        <span className="brand">◈ ASTRONEX</span>
        <div className="v-sep"></div>

        <select className="sym-select" id="symSelect" defaultValue="BTCUSDT">
          <option value="BTCUSDT">BTC / USDT</option>
          <option value="ETHUSDT">ETH / USDT</option>
          <option value="SOLUSDT">SOL / USDT</option>
          <option value="BNBUSDT">BNB / USDT</option>
          <option value="XRPUSDT">XRP / USDT</option>
          <option value="DOGEUSDT">DOGE / USDT</option>
          <option value="AVAXUSDT">AVAX / USDT</option>
        </select>

        <div className="tf-group" id="tfGroup">
          <button className="tf-btn" data-tf="1m">1m</button>
          <button className="tf-btn" data-tf="5m">5m</button>
          <button className="tf-btn" data-tf="15m">15m</button>
          <button className="tf-btn active" data-tf="1h">1H</button>
          <button className="tf-btn" data-tf="4h">4H</button>
          <button className="tf-btn" data-tf="1d">1D</button>
          <button className="tf-btn" data-tf="1w">1W</button>
        </div>

        <div className="price-block">
          <div id="priceVal">—</div>
          <div id="priceBadge" className="badge-up"></div>
        </div>
      </div>

      {/* ▸ SUB-TOOLBAR */}
      <div className="subtoolbar">
        <div className="ind-chips">
          <span className="chip"><span className="dot" style={{background: 'var(--ema9)'}}></span>EMA 9</span>
          <span className="chip"><span className="dot" style={{background: 'var(--ema21)'}}></span>EMA 21</span>
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