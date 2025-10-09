#!/usr/bin/env python3
"""
Импортирует все ozord_* workflows в n8n через API
"""

import os
import sys
import json
import requests
from pathlib import Path

# n8n API Configuration
N8N_API_KEY = os.getenv('N8N_API_KEY')
N8N_BASE_URL = os.getenv('N8N_BASE_URL', 'https://sirnokoknot.beget.app')

if not N8N_API_KEY:
    print("❌ N8N_API_KEY environment variable not set!")
    print("   Set it with: export N8N_API_KEY='your-key-here'")
    sys.exit(1)

API_URL = f"{N8N_BASE_URL}/api/v1"
HEADERS = {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json"
}


def get_existing_workflows():
    """Получить список существующих workflows"""
    response = requests.get(f"{API_URL}/workflows", headers=HEADERS)
    response.raise_for_status()
    workflows = response.json()["data"]
    return {wf["name"]: wf["id"] for wf in workflows}


def import_workflow(filepath):
    """Импортировать workflow из файла"""
    with open(filepath, 'r', encoding='utf-8') as f:
        workflow_data = json.load(f)
    
    # Очищаем read-only поля для n8n API
    clean_workflow = {
        'name': workflow_data['name'],
        'nodes': workflow_data['nodes'],
        'connections': workflow_data['connections'],
        'settings': workflow_data.get('settings', {})  # settings обязателен для n8n API
    }
    
    response = requests.post(
        f"{API_URL}/workflows",
        headers=HEADERS,
        json=clean_workflow
    )
    
    if response.status_code in [200, 201]:
        return response.json()["id"]
    else:
        raise Exception(f"Failed to import: {response.text}")


def update_workflow(workflow_id, filepath):
    """Обновить существующий workflow"""
    with open(filepath, 'r', encoding='utf-8') as f:
        workflow_data = json.load(f)
    
    clean_workflow = {
        'name': workflow_data['name'],
        'nodes': workflow_data['nodes'],
        'connections': workflow_data['connections']
    }
    
    if 'settings' in workflow_data and workflow_data['settings']:
        clean_workflow['settings'] = workflow_data['settings']
    
    response = requests.put(
        f"{API_URL}/workflows/{workflow_id}",
        headers=HEADERS,
        json=clean_workflow
    )
    response.raise_for_status()
    return workflow_id


def activate_workflow(workflow_id):
    """Активировать workflow"""
    response = requests.post(
        f"{API_URL}/workflows/{workflow_id}/activate",
        headers=HEADERS
    )
    return response.status_code == 200


def main():
    print("🚀 Начинаю импорт всех ozord_* workflows...")
    print()
    
    # Получаем существующие workflows
    print("📋 Проверяю существующие workflows в n8n...")
    existing = get_existing_workflows()
    print(f"   Найдено: {len(existing)} workflows")
    ozord_existing = {name: wf_id for name, wf_id in existing.items() if name.startswith('ozord_')}
    if ozord_existing:
        print(f"   Из них ozord_*: {len(ozord_existing)}")
    print()
    
    # Импортируем workflows
    workflows_dir = Path(__file__).parent.parent / 'workflows'
    workflow_files = sorted(workflows_dir.glob('ozord_*.n8n.json'))
    
    print(f"📦 Найдено {len(workflow_files)} ozord_* файлов для импорта")
    print()
    
    imported = []
    updated = []
    errors = []
    
    for filepath in workflow_files:
        workflow_name = filepath.stem  # без расширения
        
        # Читаем name из JSON
        with open(filepath, 'r') as f:
            workflow_data = json.load(f)
            json_name = workflow_data['name']
        
        try:
            if json_name in existing:
                # Обновляем существующий
                wf_id = existing[json_name]
                update_workflow(wf_id, filepath)
                updated.append((json_name, wf_id))
                print(f"🔄 {json_name}")
                print(f"   Обновлён (ID: {wf_id})")
            else:
                # Импортируем новый
                wf_id = import_workflow(filepath)
                imported.append((json_name, wf_id))
                print(f"✅ {json_name}")
                print(f"   Импортирован (ID: {wf_id})")
            
            print(f"   🔗 https://sirnokoknot.beget.app/workflow/{wf_id}")
            print()
        
        except Exception as e:
            errors.append((json_name, str(e)))
            print(f"❌ {json_name}")
            print(f"   Ошибка: {e}")
            print()
    
    # Итоги
    print("="*60)
    print("📊 ИТОГИ ИМПОРТА")
    print("="*60)
    print(f"✅ Импортировано новых: {len(imported)}")
    print(f"🔄 Обновлено существующих: {len(updated)}")
    print(f"❌ Ошибок: {len(errors)}")
    print()
    
    if errors:
        print("Ошибки:")
        for name, error in errors:
            print(f"  - {name}: {error}")
        print()
    
    # Проверяем тестовые workflows
    test_dir = workflows_dir / 'tests'
    if test_dir.exists():
        test_files = sorted(test_dir.glob('ozord_test_*.n8n.json'))
        if test_files:
            print(f"🧪 Найдено {len(test_files)} тестовых workflows")
            print("   Для импорта тестов запустите:")
            print("   python3 scripts/import_all_workflows.py --tests")
    
    print("="*60)
    
    return 0 if not errors else 1


if __name__ == "__main__":
    try:
        exit(main())
    except KeyboardInterrupt:
        print("\n⚠️  Прервано пользователем")
        exit(130)
    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
