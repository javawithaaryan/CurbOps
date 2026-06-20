import json
with open('data/zone_summary.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
for d in data[:5]:
    action = d.get('action_tier', 'NOT_FOUND')
    violation = d.get('top_violation_types', [{}])[0].get('type', 'NONE')
    print(f"Zone {d.get('zone_id')}: action_tier='{action}', top_violation='{violation}'")
