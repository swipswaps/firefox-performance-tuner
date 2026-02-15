#!/usr/bin/env python3
"""
Automated test for Firefox Performance Tuner extension installation and verification.
Tests accessibility (text contrast) and functionality (process data display).
"""

import os
import sys
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

def test_github_pages_accessibility():
    """Test GitHub Pages for white-on-white text issues"""
    print("=" * 80)
    print("TEST 1: GitHub Pages Accessibility Check")
    print("=" * 80)
    
    options = Options()
    # Run headless for automation
    # options.add_argument('--headless')
    
    driver = webdriver.Firefox(options=options)
    
    try:
        url = "https://swipswaps.github.io/firefox-performance-tuner/"
        print(f"\n1. Opening: {url}")
        driver.get(url)

        # Wait for React to render
        print("\n2. Waiting for React app to load...")
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".tab")))
        time.sleep(2)  # Extra time for full render

        print("\n3. Checking for Process Monitor tab...")
        tabs = driver.find_elements(By.CSS_SELECTOR, ".tab")
        print(f"   Found {len(tabs)} tabs total")

        process_tab = None
        for tab in tabs:
            print(f"   Tab text: '{tab.text}'")
            if "Process" in tab.text or "Monitor" in tab.text:
                process_tab = tab
                print(f"   ✓ Found Process Monitor tab")
                break
        
        if not process_tab:
            print("   ✗ Process Monitor tab not found")
            return False
        
        print("\n3. Clicking Process Monitor tab...")
        process_tab.click()
        time.sleep(2)
        
        print("\n4. Checking for installation instructions...")
        info_boxes = driver.find_elements(By.CSS_SELECTOR, ".info-box, .section")
        
        for box in info_boxes:
            text = box.text
            if "Install Browser Extension" in text:
                print(f"   ✓ Found installation instructions")
                
                # Check computed styles for accessibility
                print("\n5. Checking text contrast (accessibility)...")
                
                # Check <code> elements
                code_elements = box.find_elements(By.TAG_NAME, "code")
                for i, code in enumerate(code_elements[:3]):
                    bg_color = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).backgroundColor;", code
                    )
                    color = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).color;", code
                    )
                    user_select = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).userSelect;", code
                    )
                    
                    print(f"   <code> element {i+1}:")
                    print(f"      background: {bg_color}")
                    print(f"      color: {color}")
                    print(f"      user-select: {user_select}")
                    print(f"      text: {code.text[:50]}")
                    
                    # Check for white-on-white (both rgb(255,255,255))
                    if bg_color == "rgb(255, 255, 255)" and color == "rgb(255, 255, 255)":
                        print(f"      ✗ ACCESSIBILITY VIOLATION: White text on white background!")
                        return False
                
                # Check <kbd> elements
                kbd_elements = box.find_elements(By.TAG_NAME, "kbd")
                for i, kbd in enumerate(kbd_elements[:3]):
                    bg_color = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).backgroundColor;", kbd
                    )
                    color = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).color;", kbd
                    )
                    
                    print(f"   <kbd> element {i+1}:")
                    print(f"      background: {bg_color}")
                    print(f"      color: {color}")
                    print(f"      text: {kbd.text}")
                
                print("\n6. Checking text selectability...")
                paragraphs = box.find_elements(By.TAG_NAME, "p")
                for i, p in enumerate(paragraphs[:2]):
                    user_select = driver.execute_script(
                        "return window.getComputedStyle(arguments[0]).userSelect;", p
                    )
                    print(f"   <p> element {i+1}: user-select = {user_select}")
                    if user_select == "none":
                        print(f"      ✗ ACCESSIBILITY VIOLATION: Text not selectable!")
                        return False
                
                print("\n✓ Accessibility check passed")
                return True
        
        print("   ✗ Installation instructions not found")
        return False
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        print("\n7. Closing browser...")
        driver.quit()

if __name__ == "__main__":
    success = test_github_pages_accessibility()
    sys.exit(0 if success else 1)

