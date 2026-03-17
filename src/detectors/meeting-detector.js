// Universal meeting/call detector
// Detects meetings across Teams, Zoom, Meet, FaceTime, Slack, Discord, WebEx

const { exec } = require('child_process');
const { desktopCapturer } = require('electron');
const EventEmitter = require('events');

class MeetingDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.isInMeeting = false;
    this.meetingSource = null;
    this.meetingConfirmCount = 0;
    this.requiredConfirmations = 2;
  }

  log(...args) {
    if (this.debug) console.log('[MeetingDetector]', ...args);
  }

  async check() {
    const wasInMeeting = this.isInMeeting;
    const previousSource = this.meetingSource;

    let detected = false;
    let source = null;

    // Window title detection
    const windowResult = await this.detectViaWindow();
    if (windowResult) {
      detected = true;
      source = windowResult;
    }

    // Process detection as backup
    if (!detected) {
      const processResult = await this.detectViaProcess();
      if (processResult) {
        detected = true;
        source = processResult;
      }
    }

    this.log(`Detection: window=${windowResult}, process=${detected ? source : false}`);

    // Confirmation counter to avoid false positives
    if (wasInMeeting !== detected) {
      this.meetingConfirmCount++;
      this.log(`State change pending: ${this.meetingConfirmCount}/${this.requiredConfirmations}`);

      if (this.meetingConfirmCount >= this.requiredConfirmations) {
        this.isInMeeting = detected;
        this.meetingSource = detected ? source : null;
        this.meetingConfirmCount = 0;

        if (detected) {
          this.log(`Meeting started: ${source}`);
          this.emit('meeting-start', { source });
        } else {
          this.log(`Meeting ended (was: ${previousSource})`);
          this.emit('meeting-end', { source: previousSource });
        }
      }
    } else {
      this.meetingConfirmCount = 0;
    }

    return { inMeeting: this.isInMeeting, source: this.meetingSource };
  }

  async detectViaWindow() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 0, height: 0 }
      });

      const windowTitles = sources.map(s => s.name);
      this.log('Windows:', windowTitles);

      for (const source of sources) {
        const title = source.name.toLowerCase();

        // Teams
        if ((title.includes('microsoft teams') || title.includes('teams')) &&
            !title.includes('chat | microsoft teams') &&
            !title.includes('teams chat') &&
            !title.includes('about teams') &&
            !title.includes('teams settings')) {
          const teamsMeetingPatterns = [
            'meeting in progress', 'teams meeting', 'call | microsoft teams',
            'video call', 'teams call', 'join now'
          ];
          if (teamsMeetingPatterns.some(p => title.includes(p))) {
            return 'Teams';
          }
        }

        // Zoom
        if (title.includes('zoom meeting') || title.includes('zoom webinar') ||
            (title.includes('zoom') && (title.includes('meeting') || title.includes('webinar')))) {
          return 'Zoom';
        }

        // Google Meet
        if (title.includes('meet.google.com') || title.includes('google meet')) {
          return 'Google Meet';
        }

        // FaceTime
        if (title.includes('facetime') && !title.includes('facetime preferences')) {
          return 'FaceTime';
        }

        // Slack huddle/call
        if ((title.includes('slack') && (title.includes('huddle') || title.includes('call'))) ||
            title.includes('slack | huddle')) {
          return 'Slack';
        }

        // Discord voice/call
        if (title.includes('discord') && (title.includes('voice') || title.includes('call') || title.includes('stage'))) {
          return 'Discord';
        }

        // WebEx
        if (title.includes('webex meeting') || title.includes('cisco webex')) {
          return 'WebEx';
        }
      }

      return null;
    } catch (err) {
      this.log('Window detection error:', err.message);
      return null;
    }
  }

  async detectViaProcess() {
    try {
      const platform = process.platform;
      const apps = this.getAppProcesses(platform);
      const runningProcesses = await this.getRunningProcesses(platform);

      for (const app of apps) {
        const processName = app.processes[platform];
        if (!processName) continue;

        if (runningProcesses.some(p => p.toLowerCase().includes(processName.toLowerCase()))) {
          // Process is running — check CPU to see if it's actively in a call
          const cpuUsage = await this.getProcessCPU(processName, platform);
          if (cpuUsage > 10) {
            this.log(`${app.name} detected with high CPU: ${cpuUsage}%`);
            return app.name;
          }
        }
      }

      return null;
    } catch (err) {
      this.log('Process detection error:', err.message);
      return null;
    }
  }

  getAppProcesses(platform) {
    return [
      { name: 'Teams', processes: { darwin: 'Microsoft Teams', win32: 'Teams.exe', linux: 'teams' } },
      { name: 'Zoom', processes: { darwin: 'zoom.us', win32: 'Zoom.exe', linux: 'zoom' } },
      { name: 'FaceTime', processes: { darwin: 'FaceTime', win32: null, linux: null } },
      { name: 'Slack', processes: { darwin: 'Slack', win32: 'Slack.exe', linux: 'slack' } },
      { name: 'Discord', processes: { darwin: 'Discord', win32: 'Discord.exe', linux: 'discord' } },
      { name: 'WebEx', processes: { darwin: 'CiscoWebex', win32: 'webex.exe', linux: 'webex' } },
    ];
  }

  getRunningProcesses(platform) {
    return new Promise((resolve) => {
      const cmd = platform === 'darwin'
        ? "ps -ax -o command | head -200"
        : platform === 'win32'
          ? "tasklist /FO CSV /NH"
          : "ps -ax -o command | head -200";

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(stdout.split('\n').filter(Boolean));
      });
    });
  }

  getProcessCPU(processName, platform) {
    return new Promise((resolve) => {
      const cmd = platform === 'darwin'
        ? `ps -ax -o %cpu,command | grep '${processName}' | grep -v grep | awk '{print $1}' | head -1`
        : platform === 'win32'
          ? `powershell "Get-Process -Name '${processName.replace('.exe', '')}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CPU" `
          : `ps -C '${processName}' -o %cpu= 2>/dev/null | head -1`;

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        const cpu = parseFloat(stdout?.trim()) || 0;
        resolve(cpu);
      });
    });
  }
}

module.exports = MeetingDetector;
