# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BreakFlow is an Electron-based Pomodoro timer desktop app with universal meeting detection (Teams, Zoom, Meet, Slack, Discord). It pauses/adjusts the timer when the user is in a call. Built with vanilla JavaScript (no frontend framework).

## Commands

```bash
npm run watch          # Development with auto-reload (nodemon)
npm start              # Run without auto-reload
npm run build          # Build for macOS + Windows
npm run build:mac      # Build macOS only (DMG + ZIP)
npm run build:win      # Build Windows only (NSIS installer)
npm run pack           # Test build without signing (outputs to dist/)
npm run generate-icons # Generate icon assets from source
```

No test framework is configured.

## Project Structure

```
src/
  main/                    # Electron main process
    main.js                # App entry point, timer logic, window management, IPC handlers
    preload.js             # Context bridge (window.electronAPI)
    simple-detector.js     # Teams meeting detector (window title + CPU monitoring)
    meeting-detector.js    # Legacy detector (process, window, audio, browser)
    window-helper.mjs      # Window utility (get-windows wrapper)
  detectors/               # Activity detection modules
    activity-detector.js   # Universal activity detector (meetings, fullscreen, recording, focus apps)
  renderer/
    pages/                 # HTML windows
      index.html           # Main timer UI
      break-overlay.html   # Full-screen break overlay
      exercise-overlay.html # Exercise suggestions during breaks
      cursor-notification.html # Countdown notification
      settings.html        # User preferences (standalone)
      mini.html            # Floating widget
    scripts/               # Renderer-side JS
      renderer.js          # Main window UI controller
      break-overlay.js     # Break overlay logic
      settings.js          # Settings page logic
assets/
  icons/                   # App icons (all sizes, icns, ico, png)
  sounds/                  # Audio files (break-start.mp3, break-end.mp3)
scripts/                   # Build scripts (generate-icons)
resources/                 # Build resources
```

## Architecture

**Electron main/renderer split with context isolation:**

- `src/main/main.js` — Main process: timer logic, window management, system tray, settings persistence (`electron-store`), activity detector, IPC handlers
- `src/main/preload.js` — Context bridge exposing `window.electronAPI` to renderer (nodeIntegration is off)
- `src/renderer/scripts/renderer.js` — Main window UI controller, communicates via IPC
- `src/detectors/activity-detector.js` — Universal activity detector with meeting, fullscreen, recording, and focus app detection

**IPC channels:**
- Main → Renderer: `timer-update` (time/status/sessions), `restart-timer`, `timer-restart`, `settings-updated`, `show-settings`
- Renderer → Main: `start-timer`, `pause-timer`, `reset-timer`, `start-break`, `skip-break`, `end-break`, `delay-break`, `save-settings`, `toggle-widget`, `lock-screen`, `window-minimize/maximize/close`

**Platform differences:** macOS uses native title bar (`titleBarStyle: 'hiddenInset'`); Windows/Linux uses frameless window (`frame: false`). Platform detection via `process.platform` (main) and `window.electronAPI.platform` (renderer).

## Analytics

PostHog is integrated: `posthog-js` in renderer, `posthog-node` in main process.

## Build Output

electron-builder outputs to `dist/`. Build config is in `package.json` under `"build"`. macOS targets DMG+ZIP with hardened runtime; Windows targets NSIS x64 installer.
