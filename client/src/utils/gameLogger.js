/**
 * Universal Game Core V2 Logger
 * Helps developers track down socket drops, reconnect logic, and telemetry payloads.
 */

class GameLoggerService {
  constructor() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      window._wajibetLogs = this.logs;
      window.downloadGameLogs = this.download.bind(this);
      window.printGameLogs = () => console.log(this.logs.join('\n'));
    }
  }

  log(context, action, data = null) {
    const timestamp = new Date().toISOString();
    let dataStr = '';
    
    if (data) {
      try {
        dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
      } catch (e) {
        dataStr = '[Unserializable Data]';
      }
    }

    const logString = `[WAJIBET_V2] [${timestamp}] [${context}] ${action} ${dataStr ? '| ' + dataStr : ''}`;
    
    // Print heavily styled to the console for easy scanning
    console.log(`%c[WAJIBET_V2]%c [${context}] %c${action}`, 'color: #f97316; font-weight: bold;', 'color: #3b82f6;', 'color: inherit;', data || '');
    
    this.logs.push(logString);
  }

  download() {
    if (this.logs.length === 0) {
      console.warn('No logs to download.');
      return;
    }
    const blob = new Blob([this.logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wajibet_student_logs_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    console.log(`%c[WAJIBET_V2] Logs downloaded successfully.`, 'color: #10b981; font-weight: bold;');
  }
  
  clear() {
    this.logs.length = 0;
  }
}

export const GameLogger = new GameLoggerService();
