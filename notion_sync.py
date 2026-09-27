import os
import re
import json
import urllib.request
import urllib.error

# Read token from environment variable or local .env file
def get_notion_token():
    token = os.environ.get("NOTION_TOKEN")
    if token:
        return token
    env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("NOTION_TOKEN="):
                    return line.strip().split("=", 1)[1].strip("\"' ")
    return ""

META_DB_ID = "3e5e091f-51e9-8176-b91a-c39ad9c13151"       # 시너지 미적분1 DB
VIDEO_DB_ID = "3a6e091f-51e9-80ae-9e30-de95ebfe21d6"      # 미적분1 시너지손풀이 DB
CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_cache.json")

def get_headers():
    token = get_notion_token()
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }

def query_database(db_id):
    results = []
    has_more = True
    next_cursor = None
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    headers = get_headers()

    while has_more:
        body = {"page_size": 100}
        if next_cursor:
            body["start_cursor"] = next_cursor
        req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                results.extend(data.get("results", []))
                has_more = data.get("has_more", False)
                next_cursor = data.get("next_cursor")
        except urllib.error.HTTPError as e:
            print(f"Notion API HTTP error ({e.code}): {e.read().decode('utf-8')}")
            break
        except Exception as e:
            print(f"Notion API error for {db_id}: {e}")
            break
    return results

def extract_plain_text(prop_list):
    if not prop_list or not isinstance(prop_list, list):
        return ""
    return "".join([item.get("plain_text", "") for item in prop_list]).strip()

def sync_notion_data():
    print(">> [1/3] '시너지 미적분1 DB' (메타데이터) 수신 중...")
    meta_rows = query_database(META_DB_ID)
    print(f"  -> 메타데이터 {len(meta_rows)}건 조회 완료")

    print(">> [2/3] '미적분1 시너지손풀이 DB' (영상 링크) 수신 중...")
    video_rows = query_database(VIDEO_DB_ID)
    print(f"  -> 손풀이 영상 {len(video_rows)}건 조회 완료")

    # 1. Parse video rows by problem numbers found in titles
    video_map = {}
    for row in video_rows:
        props = row.get("properties", {})
        title_prop = props.get("이름", {}).get("title", [])
        title_text = extract_plain_text(title_prop)
        url = props.get("URL", {}).get("url") or ""
        unit_obj = props.get("단원", {}).get("select") or {}
        unit = unit_obj.get("name", "") if isinstance(unit_obj, dict) else ""

        # Extract problem numbers from parentheses first (e.g. "(22, 23, 27, 30, 32, 33)")
        paren_match = re.search(r'\(([^)]+)\)', title_text)
        target_text = paren_match.group(1) if paren_match else title_text
        nums = re.findall(r'\b\d+\b', target_text)

        for n in nums:
            num_val = int(n)
            # Only map numbers up to 920 for 시너지 미적분1
            if 1 <= num_val <= 920:
                norm_no = f"{num_val:04d}"
                if norm_no not in video_map:
                    video_map[norm_no] = {
                        "video_title": title_text,
                        "url": url,
                        "unit": unit
                    }

    # 2. Build unified dictionary keyed by 4-digit problem number
    data_by_number = {}

    for row in meta_rows:
        props = row.get("properties", {})
        
        # 문제번호
        p_no_prop = props.get("문제 번호", {}).get("title", [])
        raw_p_no = extract_plain_text(p_no_prop)
        if not raw_p_no:
            continue
        
        norm_no = f"{int(raw_p_no):04d}" if raw_p_no.isdigit() else raw_p_no.strip()
        
        # 난이도
        diff_obj = props.get("난이도", {}).get("select") or {}
        difficulty = diff_obj.get("name", "") if isinstance(diff_obj, dict) else ""
        
        # 단원
        unit_obj = props.get("단원", {}).get("select") or {}
        unit = unit_obj.get("name", "") if isinstance(unit_obj, dict) else ""
        
        # 문제유형
        type_prop = props.get("문제유형", {}).get("rich_text", [])
        problem_type = extract_plain_text(type_prop)
        
        # 출제의도
        intent_prop = props.get("출제의도", {}).get("rich_text", [])
        intent = extract_plain_text(intent_prop)
        
        # 손풀이링크
        link = props.get("손풀이링크", {}).get("url") or ""
        
        # 만약 메타데이터에 손풀이링크가 비어있고 영상 DB에 매칭이 있다면 보완
        if not link and norm_no in video_map:
            link = video_map[norm_no]["url"]

        data_by_number[norm_no] = {
            "problem_no": norm_no,
            "display_no": str(int(norm_no)) if norm_no.isdigit() else norm_no,
            "difficulty": difficulty,
            "unit": unit,
            "problem_type": problem_type,
            "intent": intent,
            "solution_link": link,
            "has_solution": bool(link)
        }

    # 영상 DB의 번호 중 메타 DB에 없는 번호(예: 1000번대 등)는 추가하지 않음 (오직 시너지 미적분1 DB 기준)

    print(f">> [3/3] 통합 데이터 구성 완료: 총 {len(data_by_number)}개 문항 (시너지 미적분1 DB 기준)")
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(data_by_number, f, ensure_ascii=False, indent=2)
    
    # Also save to static and public folder for Vercel/CDN static deployment
    for sub in ["static", "public"]:
        sub_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), sub, "data_cache.json")
        try:
            with open(sub_cache, "w", encoding="utf-8") as f:
                json.dump(data_by_number, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    print(f"[OK] 캐시 저장 완료: {CACHE_FILE}")
    return data_by_number

def load_cached_data():
    if not os.path.exists(CACHE_FILE):
        return sync_notion_data()
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"캐시 로드 실패 ({e}), 다시 동기화합니다.")
        return sync_notion_data()

if __name__ == "__main__":
    sync_notion_data()
