// Content script: Injects into the Performance Tuner web page
// Provides process data from about:processes to the React app

// Inject a script that the React app can access
const script = document.createElement('script');
script.textContent = `
  (function() {
    // Create a global API for the React app to request process data
    window.firefoxProcessBridge = {
      getProcesses: async function() {
        return new Promise((resolve) => {
          window.postMessage({ type: 'REQUEST_PROCESS_DATA' }, '*');
          
          const handler = (event) => {
            if (event.data.type === 'PROCESS_DATA_RESPONSE') {
              window.removeEventListener('message', handler);
              resolve(event.data.processes);
            }
          };
          
          window.addEventListener('message', handler);
          
          // Timeout after 5 seconds
          setTimeout(() => {
            window.removeEventListener('message', handler);
            resolve([]);
          }, 5000);
        });
      },
      
      isAvailable: function() {
        return true;
      }
    };
    
    // Notify React app that bridge is ready
    window.dispatchEvent(new CustomEvent('firefoxProcessBridgeReady'));
  })();
`;
document.documentElement.appendChild(script);
script.remove();

// Listen for requests from the injected script
window.addEventListener('message', async (event) => {
  if (event.data.type === 'REQUEST_PROCESS_DATA') {
    try {
      const response = await browser.runtime.sendMessage({ type: 'GET_PROCESS_DATA' });
      
      window.postMessage({
        type: 'PROCESS_DATA_RESPONSE',
        processes: response.success ? response.data : []
      }, '*');
    } catch (error) {
      console.error('Failed to get process data:', error);
      window.postMessage({
        type: 'PROCESS_DATA_RESPONSE',
        processes: []
      }, '*');
    }
  }
});

