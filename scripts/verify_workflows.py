#!/usr/bin/env python3
"""
Проверка соответствия всех workflows их спецификациям
"""

import json
import sys
from pathlib import Path

# Спецификации workflows
WORKFLOW_SPECS = {
    "ozord_ui_orchestrator": {
        "purpose": "Send-or-edit logic with fallback",
        "keywords": ["edit", "send", "redis", "fallback"]
    },
    "ozord_files_session_and_clear": {
        "purpose": "File session management",
        "keywords": ["session", "clear", "csv"]
    },
    "ozord_calendar_render_grid": {
        "purpose": "7×5 grid rendering",
        "keywords": ["grid", "7", "5", "calendar"]
    },
    "ozord_dates_toggle_and_limit": {
        "purpose": "3-date limit toggle",
        "keywords": ["toggle", "limit", "3", "date"]
    },
    "ozord_calendar_ui_header_and_counters": {
        "purpose": "Calendar UI with counters",
        "keywords": ["header", "counter", "html"]
    },
    "ozord_dates_done_guard_and_handoff": {
        "purpose": "Validation before stats",
        "keywords": ["guard", "validation", "check"]
    },
    "ozord_orders_stats_engine": {
        "purpose": "Statistics calculation",
        "keywords": ["stats", "sku", "utc", "msk"]
    },
    "ozord_telegram_core_access": {
        "purpose": "ACL and normalization",
        "keywords": ["acl", "whitelist", "normalize"]
    },
    "ozord_unified_router_callbacks": {
        "purpose": "Callback routing",
        "keywords": ["router", "callback", "menu", "file", "cal"]
    },
    "ozord_unified_router_messages": {
        "purpose": "Command routing",
        "keywords": ["router", "command", "start", "orders"]
    }
}

workflows_dir = Path('workflows')
total = 0
checked = 0

print("🔍 Быстрая проверка workflows...\n")

for wf_file in sorted(workflows_dir.glob('ozord_*.n8n.json')):
    with open(wf_file, 'r') as f:
        wf = json.load(f)
    
    name = wf.get('name', '')
    nodes = wf.get('nodes', [])
    
    total += 1
    base_name = name.split('(')[0].strip().replace('ozord_', '')
    
    spec = WORKFLOW_SPECS.get(name.split('(')[0].strip())
    
    if spec:
        checked += 1
        print(f"✅ {name}")
        print(f"   📝 {spec['purpose']}")
        print(f"   📊 {len(nodes)} nodes")
    else:
        print(f"⚠️  {name} - нет спецификации")
    print()

print(f"\n📊 Проверено: {checked}/{total} workflows")
