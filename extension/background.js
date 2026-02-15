// Background script: Opens about:processes in hidden tab and scrapes data
let processTab = null;

// Listen for messages from content script
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === 'GET_PROCESS_DATA') {
    try {
      // Open about:processes in a new tab if not already open
      if (!processTab) {
        processTab = await browser.tabs.create({
          url: 'about:processes',
          active: false
        });
        
        // Wait for tab to load
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Execute script in about:processes tab to extract data
      const results = await browser.tabs.executeScript(processTab.id, {
        code: `
          (function() {
            const rows = document.querySelectorAll('tr[data-pid]');
            const processes = [];
            
            rows.forEach(row => {
              const pid = row.getAttribute('data-pid');
              const cells = row.querySelectorAll('td');
              
              if (cells.length >= 5) {
                processes.push({
                  pid: parseInt(pid),
                  type: cells[0]?.textContent?.trim() || 'unknown',
                  cpu: parseFloat(cells[1]?.textContent?.replace('%', '') || '0'),
                  mem: parseFloat(cells[2]?.textContent?.replace('%', '') || '0'),
                  rss: parseInt(cells[3]?.textContent?.replace(/[^0-9]/g, '') || '0') * 1024,
                  threads: parseInt(cells[4]?.textContent || '0'),
                  uptimeSec: 0,
                  stat: 'R',
                  args: cells[0]?.textContent?.trim() || '',
                  classification: classifyProcess(cells[0]?.textContent?.trim(), parseFloat(cells[1]?.textContent?.replace('%', '') || '0'))
                });
              }
            });
            
            function classifyProcess(type, cpu) {
              if (type?.includes('Browser')) return 'main';
              if (type?.includes('GPU') || type?.includes('RDD') || type?.includes('Socket')) return 'system';
              if (type?.includes('Content')) {
                return cpu > 0.5 ? 'active-content' : 'idle-content';
              }
              return 'system';
            }
            
            return processes;
          })();
        `
      });
      
      return { success: true, data: results[0] || [] };
    } catch (error) {
      console.error('Failed to get process data:', error);
      return { success: false, error: error.message };
    }
  }
});

// Clean up when extension unloads
browser.runtime.onSuspend.addListener(() => {
  if (processTab) {
    browser.tabs.remove(processTab.id);
  }
});

