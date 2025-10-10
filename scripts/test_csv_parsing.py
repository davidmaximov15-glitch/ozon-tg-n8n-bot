#!/usr/bin/env python3
"""
Test CSV parsing logic against real FBO/FBS data files.
Identifies issues with column mapping, date parsing, and statistics calculation.
"""

import csv
import json
from datetime import datetime, timedelta
from collections import defaultdict
import sys

def parse_fbo_date(date_str):
    """Parse FBO date format: 01.10.2025 7:26 -> UTC datetime"""
    try:
        # FBO format: DD.MM.YYYY H:MM (without leading zeros for hours)
        dt = datetime.strptime(date_str.strip(), "%d.%m.%Y %H:%M")
        return dt
    except:
        try:
            # Try with seconds
            dt = datetime.strptime(date_str.strip(), "%d.%m.%Y %H:%M:%S")
            return dt
        except Exception as e:
            print(f"❌ Failed to parse FBO date '{date_str}': {e}")
            return None

def parse_fbs_date(date_str):
    """Parse FBS date format: 2025-09-27 21:10:51 -> UTC datetime"""
    try:
        dt = datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S")
        return dt
    except Exception as e:
        print(f"❌ Failed to parse FBS date '{date_str}': {e}")
        return None

def utc_to_msk(dt):
    """Convert UTC datetime to MSK (UTC+3)"""
    return dt + timedelta(hours=3)

def analyze_fbo_csv(filepath):
    """Analyze FBO CSV structure and data"""
    print(f"\n{'='*80}")
    print(f"📊 ANALYZING FBO CSV: {filepath}")
    print(f"{'='*80}\n")
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        # Read with semicolon delimiter
        reader = csv.DictReader(f, delimiter=';')
        
        # Print header analysis
        print("📋 HEADER COLUMNS:")
        headers = reader.fieldnames
        for idx, col in enumerate(headers):
            print(f"  [{chr(65+idx) if idx < 26 else 'A'+chr(65+idx-26)}] Column {idx}: {col[:50]}")
        
        # Process rows
        rows = list(reader)
        print(f"\n📦 Total rows: {len(rows)}")
        
        # Analyze first few rows
        print("\n🔍 FIRST 3 ROWS ANALYSIS:")
        for i, row in enumerate(rows[:3]):
            print(f"\n  Row {i+1}:")
            print(f"    Номер заказа (A): {row.get('Номер заказа', 'N/A')}")
            print(f"    Артикул (L): {row.get('Артикул', 'N/A')}")
            print(f"    Ваша цена (M): {row.get('Ваша цена', 'N/A')}")
            print(f"    Количество (Q): {row.get('Количество', 'N/A')}")
            print(f"    Статус (E): {row.get('Статус', 'N/A')}")
            print(f"    Принят в обработку (C): {row.get('Принят в обработку', 'N/A')}")
        
        # Test date parsing
        print("\n📅 DATE PARSING TEST:")
        dates_parsed = []
        dates_failed = []
        for row in rows[:10]:
            date_str = row.get('Принят в обработку', '')
            dt_utc = parse_fbo_date(date_str)
            if dt_utc:
                dt_msk = utc_to_msk(dt_utc)
                dates_parsed.append(dt_msk.strftime("%Y-%m-%d"))
                print(f"  ✅ '{date_str}' -> UTC: {dt_utc} -> MSK: {dt_msk.strftime('%Y-%m-%d %H:%M')}")
            else:
                dates_failed.append(date_str)
        
        if dates_failed:
            print(f"\n  ❌ Failed to parse {len(dates_failed)} dates")
        
        # Extract unique dates
        unique_dates = sorted(set(dates_parsed))
        print(f"\n  📅 Unique dates found: {unique_dates}")
        
        # Test statistics calculation
        print("\n📊 STATISTICS CALCULATION TEST:")
        stats = defaultdict(lambda: {'orders': 0, 'cancellations': 0, 'revenue': 0, 'price_sum': 0, 'price_qty': 0})
        
        STATUS_REVENUE = {'доставлен', 'доставляется', 'ожидает сборки', 'ожидает отгрузки'}
        STATUS_CANCEL = {'отменён', 'возврат'}
        
        for row in rows[:20]:
            sku = row.get('Артикул', '').strip()
            if not sku:
                continue
            
            try:
                quantity = int(row.get('Количество', '1'))
            except:
                quantity = 1
            
            try:
                price_str = row.get('Ваша цена', '0').replace(',', '.')
                price = float(price_str)
            except:
                price = 0
            
            status = row.get('Статус', '').lower().strip()
            
            if status in STATUS_REVENUE:
                stats[sku]['orders'] += quantity
                stats[sku]['price_sum'] += price * quantity
                stats[sku]['price_qty'] += quantity
                stats[sku]['revenue'] += price * quantity
            
            if status in STATUS_CANCEL:
                stats[sku]['cancellations'] += quantity
        
        print(f"\n  Found {len(stats)} unique SKUs in first 20 rows:")
        for sku, data in list(stats.items())[:5]:
            avg_price = data['price_sum'] / data['price_qty'] if data['price_qty'] > 0 else 0
            print(f"    {sku}:")
            print(f"      Orders: {data['orders']}, Cancellations: {data['cancellations']}")
            print(f"      Avg Price: {avg_price:.2f}, Revenue: {data['revenue']:.2f}")

def analyze_fbs_csv(filepath):
    """Analyze FBS CSV structure and data"""
    print(f"\n{'='*80}")
    print(f"📊 ANALYZING FBS CSV: {filepath}")
    print(f"{'='*80}\n")
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        # Read with semicolon delimiter and quoted fields
        reader = csv.DictReader(f, delimiter=';', quotechar='"')
        
        # Print header analysis
        print("📋 HEADER COLUMNS:")
        headers = reader.fieldnames
        for idx, col in enumerate(headers):
            print(f"  [{chr(65+idx) if idx < 26 else 'A'+chr(65+idx-26)}] Column {idx}: {col[:50]}")
        
        # Process rows
        rows = list(reader)
        print(f"\n📦 Total rows: {len(rows)}")
        
        # Analyze first few rows
        print("\n🔍 FIRST 3 ROWS ANALYSIS:")
        for i, row in enumerate(rows[:3]):
            print(f"\n  Row {i+1}:")
            print(f"    Номер заказа: {row.get('Номер заказа', 'N/A')}")
            print(f"    Артикул: {row.get('Артикул', 'N/A')}")
            print(f"    Ваша цена: {row.get('Ваша цена', 'N/A')}")
            print(f"    Количество: {row.get('Количество', 'N/A')}")
            print(f"    Статус: {row.get('Статус', 'N/A')}")
            print(f"    Принят в обработку: {row.get('Принят в обработку', 'N/A')}")
        
        # Test date parsing
        print("\n📅 DATE PARSING TEST:")
        dates_parsed = []
        dates_failed = []
        for row in rows[:10]:
            date_str = row.get('Принят в обработку', '')
            dt_utc = parse_fbs_date(date_str)
            if dt_utc:
                dt_msk = utc_to_msk(dt_utc)
                dates_parsed.append(dt_msk.strftime("%Y-%m-%d"))
                print(f"  ✅ '{date_str}' -> UTC: {dt_utc} -> MSK: {dt_msk.strftime('%Y-%m-%d %H:%M')}")
            else:
                dates_failed.append(date_str)
        
        if dates_failed:
            print(f"\n  ❌ Failed to parse {len(dates_failed)} dates")
        
        # Extract unique dates
        unique_dates = sorted(set(dates_parsed))
        print(f"\n  📅 Unique dates found: {unique_dates}")

def main():
    print("🚀 CSV PARSING TEST SUITE")
    print("Testing real FBO/FBS data against specification requirements")
    
    # Test FBO
    analyze_fbo_csv('orders-2025-fbo-test.csv')
    
    # Test FBS
    analyze_fbs_csv('orders-2025-fbs-test.csv')
    
    print(f"\n{'='*80}")
    print("✅ ANALYSIS COMPLETE")
    print(f"{'='*80}\n")

if __name__ == '__main__':
    main()
