import os
import re
import json
import threading
from flask import Flask, render_template, request, jsonify
from notion_sync import load_cached_data, sync_notion_data, CACHE_FILE

app = Flask(__name__)

# Global cache in memory
CACHED_PROBLEMS = {}
CACHE_LOCK = threading.Lock()

def reload_cache():
    global CACHED_PROBLEMS
    with CACHE_LOCK:
        CACHED_PROBLEMS = load_cached_data()
    print(f">> Loaded {len(CACHED_PROBLEMS)} problems into memory cache.")

# Initialize cache on startup
reload_cache()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/summary")
def get_summary():
    with CACHE_LOCK:
        total = len(CACHED_PROBLEMS)
        with_sol = sum(1 for p in CACHED_PROBLEMS.values() if p.get("has_solution"))
        units = sorted(list(set(p.get("unit") for p in CACHED_PROBLEMS.values() if p.get("unit"))))
        numeric_keys = [int(k) for k in CACHED_PROBLEMS.keys() if k.isdigit()]
        min_no = f"{min(numeric_keys):04d}" if numeric_keys else "0001"
        max_no = f"{max(numeric_keys):04d}" if numeric_keys else "0000"
    return jsonify({
        "total_problems": total,
        "solved_problems": with_sol,
        "min_no": min_no,
        "max_no": max_no,
        "units": units
    })

@app.route("/favicon.ico")
def favicon():
    return ("", 204)

@app.route("/api/search")
def search_problems():
    q = request.args.get("q", "").strip()
    unit_filter = request.args.get("unit", "").strip()
    diff_filter = request.args.get("diff", "").strip()
    only_sol = request.args.get("only_sol", "").lower() in ("true", "1")

    with CACHE_LOCK:
        all_items = CACHED_PROBLEMS

    if not q and not unit_filter and not diff_filter and not only_sol:
        # Default: return all problems
        matched_keys = sorted(all_items.keys())
    else:
        matched_keys = set()
        if q:
            # Parse tokens separated by commas, semicolons, or spaces
            # Tokens can be ranges like 1-10, 1~10, 0120-0124 or single numbers like 123
            tokens = re.split(r'[,;\s]+', q)
            for token in tokens:
                token = token.strip()
                if not token:
                    continue
                
                # Check for range or number, cleaning '#' and '번'
                cleaned = re.sub(r'^[#№\s]+', '', token).rstrip('번').strip()
                range_match = re.match(r'^(\d+)[~-](\d+)$', cleaned)
                if range_match:
                    start = int(range_match.group(1))
                    end = int(range_match.group(2))
                    if start > end:
                        start, end = end, start
                    # Limit range width to avoid runaway loops
                    end = min(end, start + 500)
                    for n in range(start, end + 1):
                        k4 = f"{n:04d}"
                        if k4 in all_items:
                            matched_keys.add(k4)
                        elif str(n) in all_items:
                            matched_keys.add(str(n))
                elif cleaned.isdigit():
                    k4 = f"{int(cleaned):04d}"
                    if k4 in all_items:
                        matched_keys.add(k4)
                    elif cleaned in all_items:
                        matched_keys.add(cleaned)
                else:
                    # Text search in unit or problem_type or intent
                    t_lower = token.lower()
                    for k, p in all_items.items():
                        if (t_lower in p.get("unit", "").lower() or
                            t_lower in p.get("problem_type", "").lower() or
                            t_lower in p.get("intent", "").lower()):
                            matched_keys.add(k)
        else:
            matched_keys = set(all_items.keys())

    # Collect matched problems
    results = [all_items[k] for k in matched_keys if k in all_items]

    # Apply filters
    if unit_filter:
        results = [p for p in results if p.get("unit") == unit_filter]
    if diff_filter:
        results = [p for p in results if diff_filter in p.get("difficulty", "")]
    if only_sol:
        results = [p for p in results if p.get("has_solution")]

    # Sort numerically by problem_no
    results.sort(key=lambda x: int(x["problem_no"]) if x["problem_no"].isdigit() else 99999)

    solved_count = sum(1 for p in results if p.get("has_solution"))
    return jsonify({
        "query": q,
        "count": len(results),
        "solved_count": solved_count,
        "problems": results
    })

@app.route("/api/problem/<problem_no>")
def get_problem(problem_no):
    norm_no = f"{int(problem_no):04d}" if problem_no.isdigit() else problem_no.strip()
    with CACHE_LOCK:
        item = CACHED_PROBLEMS.get(norm_no)
        if not item and problem_no in CACHED_PROBLEMS:
            item = CACHED_PROBLEMS[problem_no]

    if item:
        # Calculate prev / next
        sorted_keys = sorted(CACHED_PROBLEMS.keys())
        idx = sorted_keys.index(norm_no) if norm_no in sorted_keys else -1
        prev_no = sorted_keys[idx - 1] if idx > 0 else None
        next_no = sorted_keys[idx + 1] if 0 <= idx < len(sorted_keys) - 1 else None
        
        resp_data = dict(item)
        resp_data["prev_no"] = prev_no
        resp_data["next_no"] = next_no
        return jsonify({"success": True, "problem": resp_data})
    else:
        return jsonify({"success": False, "error": "해당 번호의 문제를 찾을 수 없습니다."}), 404

@app.route("/api/problems")
def list_problems():
    unit_filter = request.args.get("unit", "").strip()
    has_sol_filter = request.args.get("has_solution", "").strip()

    with CACHE_LOCK:
        items = list(CACHED_PROBLEMS.values())

    if unit_filter:
        items = [p for p in items if p.get("unit") == unit_filter]
    if has_sol_filter.lower() in ("true", "1"):
        items = [p for p in items if p.get("has_solution")]

    # Sort numerically by problem_no
    items.sort(key=lambda x: int(x["problem_no"]) if x["problem_no"].isdigit() else 99999)
    return jsonify({"count": len(items), "problems": items})

@app.route("/api/sync", methods=["POST"])
def sync_data():
    try:
        new_data = sync_notion_data()
        global CACHED_PROBLEMS
        with CACHE_LOCK:
            CACHED_PROBLEMS = new_data
        return jsonify({
            "success": True,
            "count": len(new_data),
            "message": f"노션 동기화 완료! 총 {len(new_data)}개 문항이 갱신되었습니다."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    print(">> Starting 시너지 손풀이 웹 서버 on http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
