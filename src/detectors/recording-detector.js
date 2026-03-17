// Screen recording detection
const { exec } = require('child_process');
const EventEmitter = require('events');

class RecordingDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.isRecording = false;
    this.confirmCount = 0;
    this.requiredConfirmations = 2;
  }

  log(...args) {
    if (this.debug) console.log('[RecordingDetector]', ...args);
  }

  async check() {
    const wasRecording = this.isRecording;
    const detected = await this.detectRecording();

    if (wasRecording !== detected) {
      this.confirmCount++;
      if (this.confirmCount >= this.requiredConfirmations) {
        this.isRecording = detected;
        this.confirmCount = 0;
        if (detected) {
          this.emit('recording-start');
        } else {
          this.emit('recording-end');
        }
      }
    } else {
      this.confirmCount = 0;
    }

    return { isRecording: this.isRecording };
  }

  async detectRecording() {
    const platform = process.platform;

    if (platform === 'darwin') {
      return this.detectMacOS();
    } else if (platform === 'win32') {
      return this.detectWindows();
    } else {
      return this.detectLinux();
    }
  }

  detectMacOS() {
    return new Promise((resolve) => {
      // Check for specific recording app processes using exact matching
      // pgrep -x matches exact process name, avoiding false positives
      const checks = [
        'pgrep -x screencaptureui',   // macOS native screen recording
        'pgrep -x "OBS"',             // OBS Studio
        'pgrep -xi "ScreenFlow"',     // ScreenFlow
        'pgrep -xi "Camtasia"',       // Camtasia
      ];

      // Also check for QuickTime in recording mode
      const cmd = `(${checks.join(' || ')} || ps -ax -o command | grep -i "QuickTime Player" | grep -v grep) 2>/dev/null | head -1`;

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        const found = !!(stdout && stdout.trim().length > 0);
        this.log(`Recording check: ${found ? 'detected' : 'none'}`);
        resolve(found);
      });
    });
  }

  detectWindows() {
    return new Promise((resolve) => {
      const cmd = `tasklist /FI "IMAGENAME eq obs64.exe" /FI "IMAGENAME eq obs32.exe" /FI "IMAGENAME eq GameBarPresenceWriter.exe" /FI "IMAGENAME eq Camtasia.exe" /NH 2>nul`;

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        const found = stdout && stdout.trim().length > 0 && !stdout.includes('No tasks');
        this.log(`Recording check: ${found ? 'detected' : 'none'}`);
        resolve(found);
      });
    });
  }

  detectLinux() {
    return new Promise((resolve) => {
      const cmd = `pgrep -x "obs|simplescreenrecorder|kazam" 2>/dev/null | head -1`;

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        const found = !!(stdout && stdout.trim().length > 0);
        this.log(`Recording check: ${found ? 'detected' : 'none'}`);
        resolve(found);
      });
    });
  }
}

module.exports = RecordingDetector;
