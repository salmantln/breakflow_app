// Focus app detection — delays breaks when user is in a focus app
const { exec } = require('child_process');
const EventEmitter = require('events');

const DEFAULT_FOCUS_APPS = [
  'Visual Studio Code', 'Code', 'Xcode', 'IntelliJ IDEA', 'WebStorm',
  'Figma', 'Photoshop', 'Sublime Text', 'Android Studio', 'Cursor'
];

class FocusAppDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.focusApps = options.focusApps || DEFAULT_FOCUS_APPS;
    this.isFocused = false;
    this.focusedApp = null;
    this.lastError = null;
  }

  log(...args) {
    if (this.debug) console.log('[FocusAppDetector]', ...args);
  }

  setFocusApps(apps) {
    this.focusApps = apps;
  }

  async check() {
    const wasFocused = this.isFocused;

    try {
      const appName = await this.getActiveAppName();

      if (!appName) {
        this.isFocused = false;
        this.focusedApp = null;
        return { isFocused: false, app: null };
      }

      const matched = this.focusApps.some(fa =>
        appName.toLowerCase().includes(fa.toLowerCase())
      );

      this.isFocused = matched;
      this.focusedApp = matched ? appName : null;

      if (matched !== wasFocused) {
        this.log(`Focus app ${matched ? 'active' : 'inactive'}: ${appName}`);
        if (matched) {
          this.emit('focus-app-active', { app: appName });
        } else {
          this.emit('focus-app-inactive');
        }
      }
    } catch (err) {
      // Only log error once to avoid spam
      if (this.lastError !== err.message) {
        this.lastError = err.message;
        this.log('Focus app detection error:', err.message);
      }
      this.isFocused = false;
      this.focusedApp = null;
    }

    return { isFocused: this.isFocused, app: this.focusedApp };
  }

  getActiveAppName() {
    return new Promise((resolve) => {
      const cmd = process.platform === 'darwin'
        ? `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null`
        : process.platform === 'win32'
          ? `powershell -NoProfile -Command "(Get-Process | Where-Object {$_.MainWindowHandle -ne 0} | Sort-Object -Property CPU -Descending | Select-Object -First 1).ProcessName" 2>nul`
          : `xdotool getactivewindow getwindowname 2>/dev/null`;

      exec(cmd, { timeout: 3000 }, (error, stdout) => {
        if (error || !stdout?.trim()) {
          resolve(null);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }
}

module.exports = FocusAppDetector;
