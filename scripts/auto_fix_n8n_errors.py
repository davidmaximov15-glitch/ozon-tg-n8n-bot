#!/usr/bin/env python3
"""
Автоматическое исправление ошибок в N8N workflows
"""

import os
import sys
import requests
import json
from typing import Dict, List, Any

N8N_URL = "https://sirnokoknot.beget.app/api/v1"
API_KEY = os.getenv("N8N_API_KEY")

if not API_KEY:
    print("❌ N8N_API_KEY не установлен")
    sys.exit(1)

HEADERS = {
    "X-N8N-API-KEY": API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json"
}


def get_workflow(workflow_id: str) -> Dict[str, Any]:
    """Получить workflow из N8N"""
    response = requests.get(f"{N8N_URL}/workflows/{workflow_id}", headers=HEADERS)
    response.raise_for_status()
    return response.json()


def update_workflow(workflow_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Обновить workflow в N8N"""
    response = requests.put(
        f"{N8N_URL}/workflows/{workflow_id}",
        headers=HEADERS,
        json=payload
    )
    response.raise_for_status()
    return response.json()


def get_executions(workflow_id: str, status: str = None, limit: int = 20) -> List[Dict]:
    """Получить executions для workflow"""
    params = {"workflowId": workflow_id, "limit": limit}
    if status:
        params["status"] = status
    
    response = requests.get(f"{N8N_URL}/executions", headers=HEADERS, params=params)
    response.raise_for_status()
    return response.json().get('data', [])


def get_execution_details(execution_id: str) -> Dict[str, Any]:
    """Получить детали execution"""
    response = requests.get(f"{N8N_URL}/executions/{execution_id}", headers=HEADERS)
    response.raise_for_status()
    return response.json()


def analyze_error(execution_detail: Dict[str, Any]) -> Dict[str, Any]:
    """Анализировать ошибку execution"""
    data = execution_detail.get('data', {})
    result = data.get('resultData', {})
    
    error_info = {
        'has_error': False,
        'message': None,
        'node_name': None,
        'node_type': None,
        'details': None
    }
    
    if 'error' in result:
        error = result['error']
        error_info['has_error'] = True
        error_info['message'] = error.get('message', 'Unknown error')
        
        if 'node' in error:
            node = error['node']
            error_info['node_name'] = node.get('name')
            error_info['node_type'] = node.get('type')
        
        error_info['details'] = error
    
    return error_info


def fix_missing_credentials(workflow_id: str, mapping_file: str = '.ozord_mapping.json') -> bool:
    """Исправить отсутствующие credentials, скопировав из рабочего workflow"""
    print(f"\n🔧 Исправляем credentials для workflow {workflow_id}")
    
    # Получаем наш workflow
    our_wf = get_workflow(workflow_id)
    
    # Ищем активный workflow с Telegram для копирования credentials
    all_wfs_response = requests.get(
        f"{N8N_URL}/workflows",
        headers=HEADERS,
        params={"limit": 50}
    )
    
    if all_wfs_response.status_code != 200:
        print("   ❌ Не удалось получить список workflows")
        return False
    
    all_wfs = all_wfs_response.json().get('data', [])
    
    # Ищем источник credentials
    source_creds = {'telegram': None, 'redis': None}
    
    for wf in all_wfs:
        if wf.get('id') == workflow_id:
            continue
        
        if wf.get('active'):
            detail = get_workflow(wf.get('id'))
            nodes = detail.get('nodes', [])
            
            for node in nodes:
                creds = node.get('credentials', {})
                
                if not source_creds['telegram'] and 'telegramApi' in creds:
                    source_creds['telegram'] = creds['telegramApi'].get('id')
                
                if not source_creds['redis'] and 'redis' in creds:
                    source_creds['redis'] = creds['redis'].get('id')
                
                if source_creds['telegram'] and source_creds['redis']:
                    break
        
        if source_creds['telegram'] and source_creds['redis']:
            break
    
    if not source_creds['telegram']:
        print("   ⚠️ Не найден Telegram credential")
        return False
    
    print(f"   ✅ Найдены credentials:")
    print(f"      Telegram: {source_creds['telegram']}")
    if source_creds['redis']:
        print(f"      Redis: {source_creds['redis']}")
    
    # Обновляем credentials в нашем workflow
    updated = False
    nodes = our_wf.get('nodes', [])
    
    for node in nodes:
        node_type = node.get('type', '')
        
        if 'telegram' in node_type.lower():
            if 'credentials' not in node:
                node['credentials'] = {}
            node['credentials']['telegramApi'] = {'id': source_creds['telegram']}
            updated = True
        
        if source_creds['redis'] and 'redis' in node_type.lower():
            if 'credentials' not in node:
                node['credentials'] = {}
            node['credentials']['redis'] = {'id': source_creds['redis']}
            updated = True
    
    if updated:
        payload = {
            "name": our_wf.get("name"),
            "nodes": nodes,
            "connections": our_wf.get("connections"),
            "settings": our_wf.get("settings", {})
        }
        
        update_workflow(workflow_id, payload)
        print(f"   ✅ Credentials обновлены")
        return True
    else:
        print(f"   ⚠️ Нечего обновлять")
        return False


def main():
    print("🔍 АВТОМАТИЧЕСКОЕ ИСПРАВЛЕНИЕ ОШИБОК N8N")
    print("="*80)
    
    # Получаем ID главного workflow
    if not os.path.exists('.main_workflow_id'):
        print("❌ Файл .main_workflow_id не найден")
        sys.exit(1)
    
    with open('.main_workflow_id', 'r') as f:
        main_wf_id = f.read().strip()
    
    print(f"Main Workflow ID: {main_wf_id}")
    
    # Проверяем workflow
    wf = get_workflow(main_wf_id)
    print(f"Workflow: {wf.get('name')}")
    print(f"Active: {wf.get('active')}")
    
    if not wf.get('active'):
        print(f"\n⚠️ Workflow не активен")
        print(f"   Попытка исправить credentials...")
        
        if fix_missing_credentials(main_wf_id):
            print(f"\n✅ Credentials исправлены!")
            print(f"   💡 Попробуйте активировать через UI:")
            print(f"   https://sirnokoknot.beget.app/workflow/{main_wf_id}")
        else:
            print(f"\n⚠️ Не удалось автоматически исправить")
    
    # Проверяем executions с ошибками
    print(f"\n📊 Проверяем executions...")
    
    error_execs = get_executions(main_wf_id, status="error", limit=10)
    
    if error_execs:
        print(f"   Найдено executions с ошибками: {len(error_execs)}")
        
        for exec_data in error_execs[:5]:
            exec_id = exec_data.get('id')
            print(f"\n   🔍 Анализируем execution {exec_id}...")
            
            try:
                detail = get_execution_details(exec_id)
                error = analyze_error(detail)
                
                if error['has_error']:
                    print(f"      ❌ Ошибка: {error['message']}")
                    print(f"      Node: {error['node_name']} ({error['node_type']})")
                    
                    # Сохраняем детали
                    filename = f"error_{exec_id}.json"
                    with open(filename, 'w') as f:
                        json.dump(detail, f, indent=2, ensure_ascii=False)
                    print(f"      Детали: {filename}")
                    
                    # Пытаемся определить тип ошибки и исправить
                    if 'credential' in error['message'].lower():
                        print(f"      💡 Ошибка связана с credentials")
                        fix_missing_credentials(main_wf_id)
            
            except Exception as e:
                print(f"      ⚠️ Ошибка получения деталей: {e}")
    else:
        print(f"   ✅ Нет executions с ошибками")
    
    print("\n" + "="*80)
    print("✅ ПРОВЕРКА ЗАВЕРШЕНА")


if __name__ == "__main__":
    main()
