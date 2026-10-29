"""src.html + data.json → index.html (첫 화면용 데이터를 내장해 오프라인·첫 실행에도 바로 보이게)"""
import json, pathlib
here = pathlib.Path(__file__).parent
seed = (here / "data.json").read_text(encoding="utf-8").replace("</", "<\\/")
html = (here / "src.html").read_text(encoding="utf-8").replace("__SEED__", seed)
(here / "index.html").write_text(html, encoding="utf-8")
print("index.html", len(html))
