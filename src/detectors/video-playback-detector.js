// Video playback detector
// Detects active video players (VLC, IINA, QuickTime, mpv, browser video)

const { exec } = require('child_process');
const EventEmitter = require('events');

class VideoPlaybackDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.isPlaying = false;
    this.confirmCount = 0;
    this.requiredConfirmations = 2;
  }

  log(...args) {
    if (this.debug) console.log('[VideoPlaybackDetector]', ...args);
  }

  async check() {
    const wasPlaying = this.isPlaying;

    let detected = false;
    let source = null;

    const platform = process.platform;

    if (platform === 'darwin') {
      const result = await this.detectMacOS();
      if (result) {
        detected = true;
        source = result;
      }
    } else if (platform === 'win32') {
      const result = await this.detectWindows();
      if (result) {
        detected = true;
        source = result;
      }
    }

    this.log(`Detection: detected=${detected}, source=${source}`);

    // Confirmation counter to avoid false positives
    if (wasPlaying !== detected) {
      this.confirmCount++;
      this.log(`State change pending: ${this.confirmCount}/${this.requiredConfirmations}`);

      if (this.confirmCount >= this.requiredConfirmations) {
        this.isPlaying = detected;
        this.confirmCount = 0;

        if (detected) {
          this.log(`Video playback started: ${source}`);
          this.emit('video-start', { source });
        } else {
          this.log('Video playback ended');
          this.emit('video-end', {});
        }
      }
    } else {
      this.confirmCount = 0;
    }

    return { isPlaying: this.isPlaying, source: this.isPlaying ? source : null };
  }

  detectMacOS() {
    return new Promise((resolve) => {
      // Check frontmost app to see if it's a known video player
      const frontmostCmd = `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`;

      exec(frontmostCmd, { timeout: 5000 }, (error, stdout) => {
        if (!error && stdout) {
          const frontApp = stdout.trim();
          const videoPlayers = ['VLC', 'IINA', 'QuickTime Player', 'mpv'];

          if (videoPlayers.some(player => frontApp.toLowerCase().includes(player.toLowerCase()))) {
            this.log(`Frontmost video player: ${frontApp}`);
            resolve(frontApp);
            return;
          }
        }

        // Fallback: check if any known video player process is running
        const processCmd = `ps -ax -o command | grep -i "vlc\\|iina\\|quicktime\\|mpv" | grep -v grep`;

        exec(processCmd, { timeout: 5000 }, (procError, procStdout) => {
          if (procError || !procStdout?.trim()) {
            resolve(null);
            return;
          }

          const lines = procStdout.trim().split('\n').filter(Boolean);
          if (lines.length === 0) {
            resolve(null);
            return;
          }

          // Identify which player is running
          const output = procStdout.toLowerCase();
          if (output.includes('vlc')) {
            resolve('VLC');
          } else if (output.includes('iina')) {
            resolve('IINA');
          } else if (output.includes('quicktime')) {
            resolve('QuickTime Player');
          } else if (output.includes('mpv')) {
            resolve('mpv');
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  detectWindows() {
    return new Promise((resolve) => {
      // Check for known video player processes
      const cmd = 'tasklist /FO CSV /NH';

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }

        const processes = stdout.toLowerCase();

        if (processes.includes('vlc.exe')) {
          resolve('VLC');
          return;
        }

        if (processes.includes('wmplayer.exe')) {
          resolve('Windows Media Player');
          return;
        }

        // Check browser window titles for video-related patterns
        const titleCmd = 'powershell "Get-Process | Where-Object {$_.MainWindowTitle -ne \'\'} | Select-Object -ExpandProperty MainWindowTitle"';

        exec(titleCmd, { timeout: 5000 }, (titleError, titleStdout) => {
          if (titleError || !titleStdout) {
            resolve(null);
            return;
          }

          const titles = titleStdout.toLowerCase().split('\n').filter(Boolean);
          const videoPatterns = [
            'youtube', 'netflix', 'hulu', 'disney+', 'prime video',
            'twitch', 'vimeo', 'hbo max', 'peacock', 'crunchyroll',
            'plex', 'watching', 'video player'
          ];

          for (const title of titles) {
            for (const pattern of videoPatterns) {
              if (title.includes(pattern)) {
                this.log(`Video browser title detected: ${title.trim()}`);
                resolve('Browser Video');
                return;
              }
            }
          }

          resolve(null);
        });
      });
    });
  }
}

module.exports = VideoPlaybackDetector;
