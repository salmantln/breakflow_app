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
    const processes = this.getRecordingProcesses(platform);

    return new Promise((resolve) => {
      let cmd;
      if (platform === 'darwin') {
        const grepPattern = processes.join('\\|');
        cmd = `ps -ax -o command | grep -i '${grepPattern}' | grep -v grep | head -1`;
      } else if (platform === 'win32') {
        const filters = processes.map(p => `IMAGENAME eq ${p}`).join('" /FI "');
        cmd = `tasklist /FI "${filters}" /NH 2>nul`;
      } else {
        const grepPattern = processes.join('\\|');
        cmd = `ps -ax -o command | grep -i '${grepPattern}' | grep -v grep | head -1`;
      }

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        const found = stdout && stdout.trim().length > 0 && !stdout.includes('No tasks');
        this.log(`Recording check: ${found ? 'detected' : 'none'}`);
        resolve(found);
      });
    });
  }

  getRecordingProcesses(platform) {
    if (platform === 'darwin') {
      // Use exact process names to avoid false positives (e.g. "OBS" matching "observe")
      return ['screencaptureui', 'OBS.app', 'obs --', 'ScreenFlow', 'Camtasia', 'QuickTime Player'];
    } else if (platform === 'win32') {
      return ['obs64.exe', 'obs32.exe', 'GameBarPresenceWriter.exe', 'Camtasia.exe'];
    } else {
      return ['obs --', 'obs-studio', 'simplescreenrecorder', 'kazam'];
    }
  }
}

module.exports = RecordingDetector;
