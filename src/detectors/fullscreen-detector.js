// Fullscreen app detection
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
      // Dynamic import for ESM module
      const activeWin = await this.getActiveWindow();
      if (!activeWin) return false;

      // Exclude our own app
      if (this.excludeApps.some(name =>
        activeWin.owner?.name?.includes(name) || activeWin.title?.includes(name)
      )) {
        return false;
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const { width, height } = primaryDisplay.bounds;
      const winBounds = activeWin.bounds;

      // Check if the window covers the full screen
      const isFullscreen = winBounds &&
        winBounds.width >= width &&
        winBounds.height >= height;

      this.log(`Active: ${activeWin.owner?.name}, bounds: ${JSON.stringify(winBounds)}, screen: ${width}x${height}, fullscreen: ${isFullscreen}`);

      return isFullscreen;
    } catch (err) {
      this.log('Fullscreen detection error:', err.message);
      return false;
    }
  }

  async getActiveWindow() {
    try {
      const activeWin = await import('active-win');
      const result = await activeWin.default();
      return result;
    } catch (err) {
      this.log('active-win error:', err.message);
      return null;
    }
  }
}

module.exports = FullscreenDetector;
