// Calendar event detector
// Detects if the user is currently in a scheduled calendar event

const { exec } = require('child_process');
const EventEmitter = require('events');

class CalendarDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.inEvent = false;
    this.confirmCount = 0;
    this.requiredConfirmations = 1;
    this.cachedResult = null;
    this.cacheExpiry = 0;
    this.cacheDurationMs = 60000;
  }

  log(...args) {
    if (this.debug) console.log('[CalendarDetector]', ...args);
  }

  async check() {
    const wasInEvent = this.inEvent;

    // Return cached result if cache is still valid
    const now = Date.now();
    if (this.cachedResult !== null && now < this.cacheExpiry) {
      this.log('Returning cached result');
      return { inEvent: this.inEvent, eventTitle: this.cachedResult?.eventTitle || null };
    }

    let detected = false;
    let eventTitle = null;

    const platform = process.platform;

    if (platform === 'darwin') {
      const result = await this.detectMacOS();
      if (result) {
        detected = true;
        eventTitle = result;
      }
    } else if (platform === 'win32') {
      const result = await this.detectWindows();
      if (result) {
        detected = true;
        eventTitle = result;
      }
    }

    this.log(`Detection: detected=${detected}, eventTitle=${eventTitle}`);

    // Update cache
    this.cachedResult = detected ? { eventTitle } : null;
    this.cacheExpiry = now + this.cacheDurationMs;

    // Confirmation counter to avoid false positives
    if (wasInEvent !== detected) {
      this.confirmCount++;
      this.log(`State change pending: ${this.confirmCount}/${this.requiredConfirmations}`);

      if (this.confirmCount >= this.requiredConfirmations) {
        this.inEvent = detected;
        this.confirmCount = 0;

        if (detected) {
          this.log(`Calendar event started: ${eventTitle}`);
          this.emit('calendar-event-start', { eventTitle });
        } else {
          this.log('Calendar event ended');
          this.emit('calendar-event-end', {});
        }
      }
    } else {
      this.confirmCount = 0;
    }

    return { inEvent: this.inEvent, eventTitle: this.inEvent ? eventTitle : null };
  }

  detectMacOS() {
    return new Promise((resolve) => {
      const script = `
        tell application "Calendar"
          set currentDate to current date
          set eventFound to ""
          repeat with aCal in every calendar
            repeat with anEvent in (every event of aCal whose start date is less than or equal to currentDate and end date is greater than currentDate)
              set eventFound to summary of anEvent
              return eventFound
            end repeat
          end repeat
          return ""
        end tell
      `;

      const cmd = `osascript -e '${script.replace(/'/g, "'\\''")}'`;

      exec(cmd, { timeout: 10000 }, (error, stdout) => {
        if (error) {
          this.log('macOS Calendar detection error:', error.message);
          resolve(null);
          return;
        }

        const title = stdout?.trim();
        if (title && title.length > 0) {
          this.log(`Current calendar event: ${title}`);
          resolve(title);
        } else {
          resolve(null);
        }
      });
    });
  }

  detectWindows() {
    return new Promise((resolve) => {
      const psScript = `
        try {
          $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
          $namespace = $outlook.GetNamespace('MAPI')
          $calendar = $namespace.GetDefaultFolder(9)
          $now = Get-Date
          $items = $calendar.Items
          $items.Sort('[Start]')
          $items.IncludeRecurrences = $true
          $filter = "[Start] <= '" + $now.ToString('g') + "' AND [End] >= '" + $now.ToString('g') + "'"
          $currentEvents = $items.Restrict($filter)
          if ($currentEvents.Count -gt 0) {
            Write-Output $currentEvents.Item(1).Subject
          }
        } catch {
          Write-Output ''
        }
      `;

      const cmd = `powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

      exec(cmd, { timeout: 10000 }, (error, stdout) => {
        if (error) {
          this.log('Windows Calendar detection error:', error.message);
          resolve(null);
          return;
        }

        const title = stdout?.trim();
        if (title && title.length > 0) {
          this.log(`Current calendar event: ${title}`);
          resolve(title);
        } else {
          resolve(null);
        }
      });
    });
  }
}

module.exports = CalendarDetector;
