// Activity detector orchestrator
// Manages all sub-detectors and emits unified pause/resume events

const EventEmitter = require('events');
const MeetingDetector = require('./meeting-detector');
const RecordingDetector = require('./recording-detector');
const FullscreenDetector = require('./fullscreen-detector');
const FocusAppDetector = require('./focus-app-detector');
const VideoPlaybackDetector = require('./video-playback-detector');
const CalendarDetector = require('./calendar-detector');

class ActivityDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debug = options.debug || false;
    this.checkIntervalMs = options.checkIntervalMs || 5000;
    this.checkInterval = null;

    // Sub-detectors
    this.meeting = new MeetingDetector({ debug: this.debug });
    this.recording = new RecordingDetector({ debug: this.debug });
    this.fullscreen = new FullscreenDetector({ debug: this.debug });
    this.focusApp = new FocusAppDetector({ debug: this.debug, focusApps: options.focusApps });
    this.videoPlayback = new VideoPlaybackDetector({ debug: this.debug });
    this.calendar = new CalendarDetector({ debug: this.debug });

    // Wire sub-detector events to unified events
    this.meeting.on('meeting-start', (data) => {
      this.emit('pause-activity-start', { reason: 'meeting', source: data.source });
    });
    this.meeting.on('meeting-end', (data) => {
      this.emit('pause-activity-end', { reason: 'meeting', source: data.source });
    });

    this.recording.on('recording-start', () => {
      this.emit('pause-activity-start', { reason: 'recording' });
    });
    this.recording.on('recording-end', () => {
      this.emit('pause-activity-end', { reason: 'recording' });
    });

    this.fullscreen.on('fullscreen-start', () => {
      this.emit('pause-activity-start', { reason: 'fullscreen' });
    });
    this.fullscreen.on('fullscreen-end', () => {
      this.emit('pause-activity-end', { reason: 'fullscreen' });
    });

    this.videoPlayback.on('video-start', () => {
      this.emit('pause-activity-start', { reason: 'video' });
    });
    this.videoPlayback.on('video-end', () => {
      this.emit('pause-activity-end', { reason: 'video' });
    });

    this.calendar.on('calendar-event-start', () => {
      this.emit('pause-activity-start', { reason: 'calendar' });
    });
    this.calendar.on('calendar-event-end', () => {
      this.emit('pause-activity-end', { reason: 'calendar' });
    });

    this.focusApp.on('focus-app-active', (data) => {
      this.emit('focus-app-active', { app: data.app });
    });
    this.focusApp.on('focus-app-inactive', () => {
      this.emit('focus-app-inactive');
    });
  }

  log(...args) {
    if (this.debug) console.log('[ActivityDetector]', ...args);
  }

  start() {
    this.log('Starting activity detection');
    this.runCheck();
    this.checkInterval = setInterval(() => this.runCheck(), this.checkIntervalMs);
    return this;
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.log('Stopped activity detection');
    return this;
  }

  async runCheck() {
    try {
      await Promise.all([
        this.meeting.check(),
        this.recording.check(),
        this.fullscreen.check(),
        this.focusApp.check(),
        this.videoPlayback.check(),
        this.calendar.check(),
      ]);
    } catch (err) {
      this.log('Check error:', err.message);
    }
  }

  setFocusApps(apps) {
    this.focusApp.setFocusApps(apps);
  }

  getStatus() {
    return {
      inMeeting: this.meeting.isInMeeting,
      meetingSource: this.meeting.meetingSource,
      isRecording: this.recording.isRecording,
      isFullscreen: this.fullscreen.isFullscreen,
      isFocusApp: this.focusApp.isFocused,
      focusedApp: this.focusApp.focusedApp,
      isVideoPlaying: this.videoPlayback.isPlaying,
      isCalendarEvent: this.calendar.inEvent,
    };
  }
}

module.exports = ActivityDetector;
