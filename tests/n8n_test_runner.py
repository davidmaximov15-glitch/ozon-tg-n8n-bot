#!/usr/bin/env python3
"""
n8n Test Runner - автоматическое тестирование workflows
Использует n8n API для запуска и проверки workflows
"""

import requests
import json
import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class N8NConfig:
    """Конфигурация подключения к n8n"""
    base_url: str = None
    api_key: str = None
    
    def __post_init__(self):
        import os
        self.base_url = self.base_url or os.getenv('N8N_BASE_URL', 'https://sirnokoknot.beget.app')
        self.api_key = self.api_key or os.getenv('N8N_API_KEY')
        
        if not self.api_key:
            raise ValueError(
                "N8N_API_KEY environment variable is required. "
                "Set it with: export N8N_API_KEY='your-api-key-here'"
            )
    
    @property
    def api_url(self) -> str:
        return f"{self.base_url}/api/v1"
    
    @property
    def headers(self) -> Dict[str, str]:
        return {
            "X-N8N-API-KEY": self.api_key,
            "Content-Type": "application/json"
        }


class N8NTestClient:
    """Клиент для работы с n8n API"""
    
    def __init__(self, config: N8NConfig = None):
        self.config = config or N8NConfig()
    
    def list_workflows(self) -> List[Dict]:
        """Получить список всех workflows"""
        response = requests.get(
            f"{self.config.api_url}/workflows",
            headers=self.config.headers
        )
        response.raise_for_status()
        return response.json()["data"]
    
    def get_workflow(self, workflow_id: str) -> Dict:
        """Получить конкретный workflow"""
        response = requests.get(
            f"{self.config.api_url}/workflows/{workflow_id}",
            headers=self.config.headers
        )
        response.raise_for_status()
        return response.json()
    
    def import_workflow(self, workflow_path: str) -> str:
        """Импортировать workflow из JSON файла"""
        with open(workflow_path, 'r', encoding='utf-8') as f:
            workflow_data = json.load(f)
        
        # Очищаем read-only поля для n8n API
        clean_workflow = {
            'name': workflow_data['name'],
            'nodes': workflow_data['nodes'],
            'connections': workflow_data['connections']
        }
        
        # Опционально settings
        if 'settings' in workflow_data and workflow_data['settings']:
            clean_workflow['settings'] = workflow_data['settings']
        
        response = requests.post(
            f"{self.config.api_url}/workflows",
            headers=self.config.headers,
            json=clean_workflow
        )
        response.raise_for_status()
        return response.json()["id"]
    
    def update_workflow(self, workflow_id: str, workflow_data: Dict) -> Dict:
        """Обновить существующий workflow"""
        response = requests.put(
            f"{self.config.api_url}/workflows/{workflow_id}",
            headers=self.config.headers,
            json=workflow_data
        )
        response.raise_for_status()
        return response.json()
    
    def execute_workflow(self, workflow_id: str, input_data: Dict = None) -> str:
        """
        Запустить workflow
        Возвращает execution_id
        """
        payload = input_data or {}
        response = requests.post(
            f"{self.config.api_url}/workflows/{workflow_id}/run",
            headers=self.config.headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()["data"]["executionId"]
    
    def get_execution(self, execution_id: str) -> Dict:
        """Получить результаты execution"""
        response = requests.get(
            f"{self.config.api_url}/executions/{execution_id}",
            headers=self.config.headers
        )
        response.raise_for_status()
        return response.json()
    
    def wait_for_execution(
        self, 
        execution_id: str, 
        timeout: int = 30,
        poll_interval: float = 0.5
    ) -> Dict:
        """
        Ждать завершения execution
        
        Args:
            execution_id: ID execution
            timeout: Максимальное время ожидания (сек)
            poll_interval: Интервал проверки (сек)
        
        Returns:
            Полные данные execution
        
        Raises:
            TimeoutError: Если execution не завершился за timeout
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            execution = self.get_execution(execution_id)
            
            if execution["finished"]:
                return execution
            
            time.sleep(poll_interval)
        
        raise TimeoutError(
            f"Execution {execution_id} не завершился за {timeout} секунд"
        )
    
    def find_workflow_by_name(self, name: str) -> Optional[str]:
        """Найти workflow ID по имени"""
        workflows = self.list_workflows()
        for wf in workflows:
            if wf["name"] == name:
                return wf["id"]
        return None


class WorkflowTestRunner:
    """Запускает тесты для workflows"""
    
    def __init__(self, client: N8NTestClient = None):
        self.client = client or N8NTestClient()
    
    def run_test_workflow(self, test_workflow_name: str) -> Dict:
        """
        Запустить тестовый workflow и получить результаты
        
        Args:
            test_workflow_name: Имя тестового workflow (например, "test_orders_menu_render")
        
        Returns:
            Результаты теста с assertions
        """
        # Найти workflow по имени
        workflow_id = self.client.find_workflow_by_name(test_workflow_name)
        
        if not workflow_id:
            raise ValueError(f"Workflow '{test_workflow_name}' не найден")
        
        print(f"🚀 Запускаю тест: {test_workflow_name}")
        
        # Запустить
        execution_id = self.client.execute_workflow(workflow_id)
        print(f"📝 Execution ID: {execution_id}")
        
        # Ждать завершения
        print("⏳ Жду завершения...")
        execution = self.client.wait_for_execution(execution_id, timeout=60)
        
        # Проверить статус
        if execution["status"] == "error":
            print("❌ Execution завершился с ошибкой")
            return {
                "success": False,
                "error": execution.get("error", "Unknown error"),
                "execution_id": execution_id
            }
        
        # Извлечь результаты из последней ноды
        result_data = self._extract_results(execution)
        
        return result_data
    
    def _extract_results(self, execution: Dict) -> Dict:
        """Извлечь результаты из execution данных"""
        try:
            run_data = execution["data"]["resultData"]["runData"]
            
            # Ищем последнюю ноду (обычно "Format Results" или "Assertions")
            last_node_name = list(run_data.keys())[-1]
            last_node_data = run_data[last_node_name][0]["data"]["main"][0][0]["json"]
            
            return last_node_data
        
        except (KeyError, IndexError) as e:
            return {
                "success": False,
                "error": f"Не удалось извлечь результаты: {e}",
                "raw_execution": execution
            }
    
    def print_test_results(self, results: Dict):
        """Красиво вывести результаты тестов"""
        print("\n" + "="*60)
        print("📊 РЕЗУЛЬТАТЫ ТЕСТОВ")
        print("="*60)
        
        if not results.get("success", False):
            print("❌ ТЕСТЫ ПРОВАЛЕНЫ")
            if "error" in results:
                print(f"Ошибка: {results['error']}")
            return
        
        total = results.get("total", 0)
        passed = results.get("passed", 0)
        failed = results.get("failed", 0)
        
        print(f"✅ Пройдено: {passed}/{total}")
        print(f"❌ Провалено: {failed}/{total}")
        print("")
        
        # Детали по каждому сценарию
        if "scenarios" in results:
            for idx, scenario in enumerate(results["scenarios"], 1):
                status = "✅" if scenario.get("passed") else "❌"
                print(f"{status} Сценарий {idx}: {scenario.get('name', 'N/A')}")
                
                if not scenario.get("passed") and "assertions" in scenario:
                    for assertion in scenario["assertions"]:
                        if not assertion.get("passed"):
                            print(f"   ❌ {assertion.get('check', 'N/A')}")
                            print(f"      Ожидалось: {assertion.get('expected')}")
                            print(f"      Получено: {assertion.get('actual')}")
        
        print("="*60)


def main():
    """Главная функция для запуска тестов"""
    runner = WorkflowTestRunner()
    
    # Список тестовых workflows для запуска
    test_workflows = [
        "test_orders_menu_render",
        "test_calendar_nav_guard",
        # Добавляй сюда новые тесты
    ]
    
    all_passed = True
    
    for test_name in test_workflows:
        try:
            results = runner.run_test_workflow(test_name)
            runner.print_test_results(results)
            
            if not results.get("success", False):
                all_passed = False
        
        except Exception as e:
            print(f"❌ Ошибка при запуске теста '{test_name}': {e}")
            all_passed = False
    
    print("\n" + "="*60)
    if all_passed:
        print("🎉 ВСЕ ТЕСТЫ ПРОШЛИ!")
    else:
        print("💥 НЕКОТОРЫЕ ТЕСТЫ ПРОВАЛЕНЫ")
    print("="*60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
