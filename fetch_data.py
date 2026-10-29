"""경제 지표 월별 데이터 수집 → data.json
출처: FRED(미 연준), OECD, Yahoo Finance(KOSPI), datasets/gold-prices(금)
"""
import csv, io, json, urllib.request, datetime, sys, time, os, subprocess, shutil

START = "2000-01"
DAILY_START = "2000-01-01"  # 일간·주간 보기용 일별 데이터
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "text/csv,application/json,*/*"}

def get(url, tries=3, browser=False):
    """curl 우선(프록시·TLS 호환성), 없으면 urllib"""
    last = None
    for i in range(tries):
        try:
            if shutil.which("curl"):
                cmd = ["curl", "-sS", "-L", "--max-time", "40"] + (["-A", "Mozilla/5.0"] if browser else []) + [url]
                r = subprocess.run(cmd,
                                   capture_output=True, check=True)
                return r.stdout.decode("utf-8")
            req = urllib.request.Request(url, headers=UA if browser else {})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            last = e; time.sleep(3 * (i + 1))
    raise last

def fred(sid):
    txt = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd=2000-01-01")
    out = {}
    for row in csv.reader(io.StringIO(txt)):
        if len(row) < 2 or row[0].startswith("observation") or row[0] == "DATE": continue
        try: out[row[0][:7]] = round(float(row[1]), 4)
        except ValueError: pass
    return out

def gold():
    txt = get("https://raw.githubusercontent.com/datasets/gold-prices/main/data/monthly.csv")
    out = {}
    for row in csv.DictReader(io.StringIO(txt)):
        k = row["Date"][:7]
        if k >= START:
            try: out[k] = round(float(row["Price"]), 2)
            except ValueError: pass
    return out

def kospi():
    txt = get("https://query2.finance.yahoo.com/v8/finance/chart/%5EKS11?interval=1mo&period1=946684800&period2=4102444800", browser=True)
    r = json.loads(txt)["chart"]["result"][0]
    out = {}
    for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]):
        if c is None: continue
        d = datetime.datetime.fromtimestamp(t + 9 * 3600, datetime.UTC)  # KST
        k = d.strftime("%Y-%m")
        if k >= START: out[k] = round(c, 2)
    return out

def yahoo_daily(sym):
    txt = get(f"https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&period1=946684800&period2=4102444800", browser=True)
    r = json.loads(txt)["chart"]["result"][0]
    out = {}
    for t, c in zip(r["timestamp"], r["indicators"]["quote"][0]["close"]):
        if c is None: continue
        k = datetime.datetime.fromtimestamp(t + 9 * 3600, datetime.UTC).strftime("%Y-%m-%d")
        if k >= DAILY_START: out[k] = round(c, 4)
    return out

def fred_daily(sid):
    txt = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={DAILY_START}")
    out = {}
    for row in csv.reader(io.StringIO(txt)):
        if len(row) < 2 or not row[0][:1].isdigit(): continue
        try: out[row[0][:10]] = round(float(row[1]), 4)
        except ValueError: pass
    return out

def merged(primary, fallback):
    """primary(주 소스) 시작일 이전 구간을 fallback(보조 소스) 일별 값으로 채움"""
    p = primary()
    try: f = fallback()
    except Exception as e: print("fallback fail", e, file=sys.stderr); f = {}
    first = min(p) if p else "9999"
    out = {k: v for k, v in f.items() if k < first}
    out.update(p)
    return out

def oecd_cli_kor():
    txt = get("https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/KOR.M.LI...AA...H?startPeriod=2000-01&format=csvfilewithlabels")
    out = {}
    for row in csv.DictReader(io.StringIO(txt)):
        try: out[row["TIME_PERIOD"][:7]] = round(float(row["OBS_VALUE"]), 3)
        except (ValueError, KeyError): pass
    return out

# (id, 이름, 단위, 출처 설명, 월별 수집, 일별 수집 또는 None)
SERIES = [
  ("fedfunds", "미국 기준금리", "%", "월별 FRED FEDFUNDS · 일별 FRED DFF(실효 연방기금금리)", lambda: fred("FEDFUNDS"), lambda: fred_daily("DFF")),
  ("usdkrw",   "원/달러 환율",  "원", "월별 FRED EXKOUS(월평균) · 일별 Yahoo KRW=X(초기 구간 FRED DEXKOUS)",          lambda: fred("EXKOUS"),   lambda: merged(lambda: yahoo_daily("KRW%3DX"), lambda: fred_daily("DEXKOUS"))),
  ("gold",     "금값",          "$/oz", "월별 LBMA(datasets/gold-prices) · 일별 Yahoo 금 선물 GC=F", gold,           lambda: yahoo_daily("GC%3DF")),
  ("wti",      "WTI 유가",      "$/bbl", "월별 FRED MCOILWTICO · 일별 Yahoo WTI 선물 CL=F(초기 구간 FRED DCOILWTICO)",   lambda: fred("MCOILWTICO"), lambda: merged(lambda: yahoo_daily("CL%3DF"), lambda: fred_daily("DCOILWTICO"))),
  ("ust10",    "미국채 10년물", "%", "월별 FRED GS10 · 일별 Yahoo ^TNX",                       lambda: fred("GS10"),     lambda: merged(lambda: yahoo_daily("%5ETNX"), lambda: fred_daily("DGS10"))),
  ("kospi",    "KOSPI",         "pt", "월별 Yahoo ^KS11 월말 종가 · 일별 Yahoo ^KS11 종가",     kospi,                    lambda: yahoo_daily("%5EKS11")),
  ("unrate",   "미국 실업률",   "%", "월별 FRED UNRATE(계절조정) · 월 1회 발표",              lambda: fred("UNRATE"),   None),
  ("krcli",    "한국 경기선행지수", "지수", "월별 OECD 경기선행지수(CLI) · 월 1회 발표",       oecd_cli_kor,             None),
]

def enc_daily(d):
    """{날짜:값} → {"s":시작일,"t":[전날과의 일수 차],"v":[값]} (용량 절감용 압축 형식)"""
    ks = sorted(d)
    if not ks: return {}
    base = datetime.date.fromisoformat(ks[0]); prev = base; t = []
    for k in ks:
        cur = datetime.date.fromisoformat(k); t.append((cur - prev).days); prev = cur
    return {"s": ks[0], "t": t, "v": [d[k] for k in ks]}

def dec_daily(e):
    if not e or "s" not in e: return e or {}
    cur = datetime.date.fromisoformat(e["s"]); out = {}
    for dt, v in zip(e["t"], e["v"]):
        cur += datetime.timedelta(days=dt); out[cur.isoformat()] = v
    return out

def main(path):
    prev = {}
    if os.path.exists(path):
        try:
            prev = {x["id"]: x for x in json.load(open(path, encoding="utf-8"))["series"]}
            for x in prev.values():
                if "daily" in x: x["daily"] = dec_daily(x["daily"])
        except Exception: prev = {}
    data = {"updated": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%MZ"), "series": []}
    for sid, name, unit, src, fm, fd in SERIES:
        item = {"id": sid, "name": name, "unit": unit, "src": src}
        for key, fn in (("values", fm), ("daily", fd)):
            if fn is None: continue
            try:
                v = fn()
            except Exception as e:
                print("FAIL", sid, key, e, file=sys.stderr); v = {}
            if not v and prev.get(sid, {}).get(key):  # 실패 시 기존 값 유지
                v = prev[sid][key]; print("  -> keep previous", sid, key, file=sys.stderr)
            nd = 3 if unit == "%" else 2  # 용량 절감: 금리 소수 3자리, 그 외 2자리
            item[key] = {k: round(v[k], nd) for k in sorted(v)}
            time.sleep(1)
        d = item.get("daily", {})
        if "daily" in item: item["daily"] = enc_daily(item["daily"])
        data["series"].append(item)
        print(sid, "월", len(item["values"]), max(item["values"]) if item["values"] else None, "| 일", len(d), max(d) if d else None)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data.json")
