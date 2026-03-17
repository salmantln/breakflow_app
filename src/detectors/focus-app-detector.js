// Focus app detection — delays breaks when user is in a focus app
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
      const activeWin = await import('active-win');
      const result = await activeWin.default();

      if (!result) {
        this.isFocused = false;
        this.focusedApp = null;
        return { isFocused: false, app: null };
      }

      const appName = result.owner?.name || '';
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
      this.log('Focus app detection error:', err.message);
      this.isFocused = false;
      this.focusedApp = null;
    }

    return { isFocused: this.isFocused, app: this.focusedApp };
  }
}

module.exports = FocusAppDetector;
