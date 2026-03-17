// Fullscreen app detection
const { exec } = require('child_process');
const { screen } = require('electron');
const EventEmitter = require('events');

class FullscreenDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.isFullscreen = false;
    this.confirmCount = 0;
    this.requiredConfirmations = 2;
    this.excludeApps = ['Break Flow', 'Electron'];
    this.lastError = null;
  }

  log(...args) {
    if (this.debug) console.log('[FullscreenDetector]', ...args);
  }

  async check() {
    const wasFullscreen = this.isFullscreen;
    const detected = await this.detectFullscreen();

    if (wasFullscreen !== detected) {
      this.confirmCount++;
      if (this.confirmCount >= this.requiredConfirmations) {
        this.isFullscreen = detected;
        this.confirmCount = 0;
        if (detected) {
          this.emit('fullscreen-start');
        } else {
          this.emit('fullscreen-end');
        }
      }
    } else {
      this.confirmCount = 0;
    }

    return { isFullscreen: this.isFullscreen };
  }

  async detectFullscreen() {
    try {
      const activeApp = await this.getActiveApp();
      if (!activeApp) return false;

      // Exclude our own app
      if (this.excludeApps.some(name => activeApp.name?.includes(name))) {
        return false;
      }

      // Check if frontmost app is fullscreen via AppleScript
      const isFullscreen = await this.checkFullscreenAppleScript();
      this.log(`Active: ${activeApp.name}, fullscreen: ${isFullscreen}`);
      return isFullscreen;
    } catch (err) {
      // Only log error once to avoid spam
      if (this.lastError !== err.message) {
        this.lastError = err.message;
        this.log('Fullscreen detection error:', err.message);
      }
      return false;
    }
  }

  getActiveApp() {
    return new Promise((resolve) => {
      const cmd = process.platform === 'darwin'
        ? `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' 2>/dev/null`
        : null;

      if (!cmd) {
        resolve(null);
        return;
      }

      exec(cmd, { timeout: 3000 }, (error, stdout) => {
        if (error || !stdout?.trim()) {
          resolve(null);
          return;
        }
        resolve({ name: stdout.trim() });
      });
    });
  }

  checkFullscreenAppleScript() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') {
        resolve(false);
        return;
      }

      // Check if the frontmost window's AXFullScreen attribute is true
      const cmd = `osascript -e '
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          try
            tell frontApp
              set frontWindow to first window
              set isFS to value of attribute "AXFullScreen" of frontWindow
              return isFS as text
            end tell
          on error
            return "false"
          end try
        end tell
      ' 2>/dev/null`;

      exec(cmd, { timeout: 3000 }, (error, stdout) => {
        resolve(stdout?.trim() === 'true');
      });
    });
  }
}

module.exports = FullscreenDetector;
