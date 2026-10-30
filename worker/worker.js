// 경제 지표 대시보드 · 실시간 중계 서버 (Cloudflare Worker)
// 앱이 요청할 때마다 Yahoo·Daum·Naver에서 최신 값을 받아 정리해 돌려줍니다.
//   /quote                   환율·금·WTI·미국채10년·KOSPI 최신 시세(1분 갱신용)
//   /flows?market=KOSPI&n=30 시장 투자자별 순매수(억원), 장중 잠정 포함
//   /search?q=삼성           종목 검색
//   /stock?code=005930       종목 시세 + 외국인·기관 순매수 + 보유율 + 거래량

// 앱 주소만 허용(다른 사이트에서 이 서버를 가져다 쓰지 못하게)
const ALLOW = [/^https:\/\/ondoguide\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const QUOTES = { usdkrw: "KRW=X", gold: "GC=F", wti: "CL=F", ust10: "^TNX", kospi: "^KS11" };
const FLOW_COLS = ["f", "i", "p", "mf", "pf", "fi", "pe", "ins", "bk", "ef", "ec"];
const FLOW_KEYS = { mf: "MUTUAL_FUND", pf: "PENSION_FUND", fi: "FINANCIAL_INVESTOR", pe: "PRIVATE_EQUITY_FUND",
  ins: "INSURANCE_COMPANIES", bk: "BANK", ef: "ETC_FINANCIAL_INSTITUTION", ec: "ETC_CORPORATION" };
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DAUM = { "User-Agent": UA, Referer: "https://finance.daum.net/domestic/investors" };

const kst = (sec) => new Date((sec + 9 * 3600) * 1000).toISOString().slice(0, 10);
const nowKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19);

async function j(url, headers = { "User-Agent": UA }) {
  const r = await fetch(url, { headers, cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function yahoo(sym) {
  // Yahoo는 단순한 User-Agent에만 응답(복잡한 브라우저 UA는 429). query2 실패 시 query1로 재시도
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, H = { "User-Agent": "Mozilla/5.0" };
  let d; try { d = await j("https://query2.finance.yahoo.com" + path, H); } catch (e) { d = await j("https://query1.finance.yahoo.com" + path, H); }
  const r = d.chart.result[0], m = r.meta, q = r.indicators.quote[0];
  const bars = [];
  r.timestamp.forEach((t, i) => { const c = q.close[i]; if (c != null) bars.push([kst(t), +c.toFixed(4)]); });
  // 장중에는 마지막 봉 종가 대신 현재가 사용
  if (bars.length && m.regularMarketPrice != null) bars[bars.length - 1][1] = +m.regularMarketPrice.toFixed(4);
  return { bars, price: m.regularMarketPrice, prev: m.chartPreviousClose ?? m.previousClose, time: m.regularMarketTime };
}

async function quote() {
  const ids = Object.keys(QUOTES);
  const res = await Promise.allSettled(ids.map((id) => yahoo(QUOTES[id])));
  const q = {};
  res.forEach((r, i) => { if (r.status === "fulfilled") q[ids[i]] = r.value; });
  return { t: nowKst(), q };
}

async function flows(market, n) {
  const d = await j(`https://finance.daum.net/api/investor/${market}/days?page=1&perPage=${n}&pagination=true&details=true`, DAUM);
  const rows = (d.data || []).slice().reverse();
  return {
    t: nowKst(), market, unit: "억원", cols: FLOW_COLS,
    d: rows.map((r) => r.date.slice(0, 10)),
    v: rows.map((r) => {
      const x = r.details || {};
      const vals = [r.foreignStraightPurchasePrice, r.institutionStraightPurchasePrice, r.individualStraightPurchasePrice,
        ...FLOW_COLS.slice(3).map((c) => x[FLOW_KEYS[c]])];
      return vals.map((v) => (v == null ? null : Math.round(v / 1e8)));
    }),
  };
}

async function search(qs) {
  const d = await j(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(qs)}&target=stock`);
  return {
    items: (d.items || []).filter((x) => x.category === "stock" && x.nationCode === "KOR" && /^\d{6}$/.test(x.code))
      .slice(0, 12).map((x) => ({ code: x.code, name: x.name, market: x.typeName || x.typeCode })),
  };
}

async function stock(code) {
  if (!/^\d{6}$/.test(code)) throw new Error("종목코드는 6자리 숫자");
  const [qr, fr] = await Promise.allSettled([
    j(`https://finance.daum.net/api/quotes/A${code}?summary=false&changeStatistics=true`, DAUM),
    j(`https://finance.daum.net/api/investor/days?symbolCode=A${code}&page=1&perPage=1000&pagination=true`, DAUM),
  ]);
  const out = { t: nowKst(), code, src: "Daum 금융" };
  if (qr.status === "fulfilled") {
    const q = qr.value;
    out.name = q.name; out.market = q.market;
    out.quote = { price: q.tradePrice, prev: q.prevClosingPrice, vol: q.accTradeVolume, amt: q.accTradePrice, high: q.highPrice, low: q.lowPrice, open: q.openingPrice };
  }
  if (fr.status === "fulfilled" && fr.value.data && fr.value.data.length) {
    const rows = fr.value.data.slice().reverse();
    // 열: 종가, 외국인 순매수(주), 기관 순매수(주), 외국인 보유율(%), 거래량(주), 거래대금(억원)
    out.cols = ["close", "f", "i", "fr", "vol", "amt"];
    out.d = rows.map((r) => r.date.slice(0, 10));
    out.v = rows.map((r) => [r.tradePrice, r.foreignStraightPurchaseVolume, r.institutionStraightPurchaseVolume,
      r.foreignOwnSharesRate == null ? null : +(r.foreignOwnSharesRate * 100).toFixed(2), r.accTradeVolume,
      r.accTradePrice == null ? null : Math.round(r.accTradePrice / 1e8)]);
  } else {
    // 보조: Naver(최근 약 2개월, 개인 포함)
    const nv = await j(`https://m.stock.naver.com/api/stock/${code}/trend?pageSize=60`);
    const num = (s) => (s == null ? null : +String(s).replace(/[,+%]/g, ""));
    const rows = nv.slice().reverse();
    out.src = "Naver 증권(최근 구간)";
    out.cols = ["close", "f", "i", "fr", "vol", "amt", "p"];
    out.d = rows.map((r) => `${r.bizdate.slice(0, 4)}-${r.bizdate.slice(4, 6)}-${r.bizdate.slice(6, 8)}`);
    out.v = rows.map((r) => [num(r.closePrice), num(r.foreignerPureBuyQuant), num(r.organPureBuyQuant), num(r.foreignerHoldRatio),
      num(r.accumulatedTradingVolume), null, num(r.individualPureBuyQuant)]);
  }
  if (!out.d && !out.quote) throw new Error("종목 데이터를 받지 못했습니다");
  return out;
}

const TTL = { quote: 30, flows: 60, stock: 60, search: 86400 };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), origin = req.headers.get("Origin") || "";
    const ok = ALLOW.some((re) => re.test(origin));
    const cors = { "Access-Control-Allow-Origin": ok ? origin : "https://ondoguide.github.io", "Access-Control-Allow-Methods": "GET, OPTIONS", Vary: "Origin" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const route = url.pathname.replace(/^\/+|\/+$/g, "") || "health";
    if (route === "health") return new Response(JSON.stringify({ ok: true, t: nowKst() }), { headers: { ...cors, "Content-Type": "application/json" } });
    if (!(route in TTL)) return new Response(JSON.stringify({ error: "없는 주소" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const cache = typeof caches !== "undefined" ? caches.default : null;
    const key = new Request(url.origin + url.pathname + url.search);
    if (cache) { const hit = await cache.match(key); if (hit) { const r = new Response(hit.body, hit); Object.entries(cors).forEach(([k, v]) => r.headers.set(k, v)); return r; } }

    try {
      let body;
      if (route === "quote") body = await quote();
      else if (route === "flows") body = await flows((url.searchParams.get("market") || "KOSPI").toUpperCase() === "KOSDAQ" ? "KOSDAQ" : "KOSPI", Math.min(200, +url.searchParams.get("n") || 30));
      else if (route === "search") body = await search(url.searchParams.get("q") || "");
      else if (route === "stock") body = await stock(url.searchParams.get("code") || "");
      const res = new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${TTL[route]}` } });
      if (cache && ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, res.clone()));
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
  },
};
