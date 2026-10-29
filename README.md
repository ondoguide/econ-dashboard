# 경제 지표 대시보드 (PWA)

8개 경제 지표를 한 화면에서 켜고 끄며 비교하는 앱입니다. 2000년부터의 일별 데이터(①~⑥)와 월별 데이터가 들어 있고, 1시간마다 자동 갱신됩니다.

**차트 조작(증권사 앱 방식)**
- 일·주·월 봉 전환, 1개월~전체 기간 버튼
- PC: 마우스 휠 확대/축소, 끌어서 이동, 더블클릭 = 처음 기간, 키보드 ←→ / + −
- 휴대폰: 좌우로 밀어 이동, 두 손가락 확대/축소, 탭·길게 누르기 = 값 보기
- 차트 아래 전체 기간 막대: 끌어서 이동, 양 끝을 잡아 구간 조절
- 구간 등락·자동 요약·상관관계가 보고 있는 구간 기준으로 바로 다시 계산됨

| 번호 | 지표 | 출처 |
|---|---|---|
| ① | 미국 기준금리(실효 연방기금금리) | FRED `FEDFUNDS` |
| ② | 원/달러 환율(월평균) | FRED `EXKOUS` |
| ③ | 금값(LBMA 월평균, $/oz) | datasets/gold-prices |
| ④ | WTI 유가(월평균, $/bbl) | FRED `MCOILWTICO` |
| ⑤ | 미국채 10년물(월평균) | FRED `GS10` |
| ⑥ | KOSPI(월말 종가) | Yahoo Finance `^KS11` |
| ⑦ | 미국 실업률 | FRED `UNRATE` |
| ⑧ | 한국 경기선행지수 | OECD CLI |

## 파일
- `index.html` — 앱 화면 (첫 실행용 데이터 내장)
- `data.json` — 지표 데이터
- `manifest.json`, `sw.js`, `icon-*.png` — 홈 화면 설치·오프라인용
- `fetch_data.py` — 데이터 수집, `build.py` — index.html 생성, `src.html` — 화면 원본
- `.github/workflows/update-data.yml` — 1시간마다 자동 갱신(GitHub 사정으로 몇 분~수십 분 늦을 수 있음)

## 배포 (GitHub Pages, 무료 · 약 10분)
1. GitHub에서 새 저장소(예: `econ-dashboard`)를 만들고 이 폴더 내용을 전부 올립니다. (`.github` 폴더 포함)
2. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `/(root)` → Save.
3. **Settings → Actions → General → Workflow permissions**에서 `Read and write permissions` 선택.
4. **Actions 탭 → 경제 지표 데이터 갱신 → Run workflow**로 한 번 돌려 정상 동작 확인.
5. 1~2분 뒤 `https://<계정>.github.io/econ-dashboard/` 주소로 접속됩니다.

(Cloudflare Pages를 쓰셔도 됩니다. 저장소를 연결하면 data.json이 갱신될 때마다 자동 배포됩니다.)

## 휴대폰에 앱처럼 설치
- **아이폰**: Safari로 주소 열기 → 공유 버튼 → `홈 화면에 추가`
- **안드로이드**: Chrome으로 주소 열기 → 메뉴(⋮) → `앱 설치` 또는 `홈 화면에 추가`

## 주의
- 카드에는 최근 값, 전일·1주·1개월·1년 대비, 최근 3개월 미니 차트가 나옵니다.
- ⑦ 미국 실업률·⑧ 한국 경기선행지수는 월 1회 발표라 일별 값이 없고, 일별 화면에서는 직전 발표값을 이어 그립니다.
- 체결 단위 실시간 시세는 아닙니다. 장중에는 최대 1시간 늦은 시세, 장 마감 후에는 종가입니다(미국 금리는 FRED 발표가 1~2일 늦습니다).
- 앱을 켜 두면 10분마다, 다시 열 때마다 새 데이터를 확인합니다.
- 투자 판단의 근거가 아니라 흐름을 보는 참고용입니다.
