# DigiMitra City Webcam Preview Setup

## Architecture

- Live preview runs completely in the browser with `navigator.mediaDevices`.
- No LiveKit, token service, room signaling, TURN/STUN, or websocket stream bus.
- The Live Feed Wall uses:
  - `enumerateDevices()` for camera discovery
  - `getUserMedia()` for stream acquisition
  - local React state for camera switching and status

## Prerequisites

- Node.js + pnpm
- A browser with webcam permissions enabled

## Environment Variables

- Frontend only needs `NEXT_PUBLIC_API_BASE_URL` for existing non-stream APIs.
- No LiveKit-related variables are required.

## Run

1. Start frontend:
   - `cd ui-police`
   - `pnpm install`
   - `pnpm dev`
2. Open dashboard and go to **Live Feed Wall**.
3. Allow browser webcam permissions.
4. Preview starts automatically on the first available camera.
5. Switch cameras from the dropdown; previous tracks are stopped automatically.

## Notes

- Stream cleanup is handled on camera switch and component unmount.
- Existing event/search APIs remain unchanged.
