# User Manual

**Document:** 09 — Operator & Administrator Guide  
**Audience:** Surveillance operators, investigators, system administrators

---

## 1. Installation (End User Perspective)

End users access DigiMitra City through a web browser. No local installation is required.

**Supported browsers:** Chrome (recommended), Firefox, Edge (latest versions)

**Requirements:**
- Stable internet connection to the DigiMitra server
- Webcam access (for Live Feed Wall recording and live frames)
- Screen resolution ≥ 1280×720 recommended

**URL:** Provided by your administrator (e.g., `http://localhost:3000` for development).

---

## 2. Login

### 2.1 First-Time Registration

1. Navigate to `/register`.
2. Enter your **full name**, **email**, and **password**.
3. Click **Sign Up**.
4. Check your email for a verification code from AWS Cognito.
5. Navigate to `/verify` and enter the code.
6. You will be redirected to login.

> **Note:** Cognito environment variables must be configured by the administrator. If registration fails with "Cognito environment variables are missing," contact your admin.

### 2.2 Sign In

1. Navigate to `/login`.
2. Enter your **email** and **password**.
3. Click **Sign In**.
4. Upon success, you are redirected to the main dashboard.

### 2.3 Session Management

- Your session is tracked via a `dm_auth` cookie.
- Closing the browser may end your session depending on cookie settings.
- Unauthenticated access to protected pages redirects to `/login`.

---

## 3. Navigation

The dashboard uses a sidebar navigation with sections controlled by the `?section=` URL parameter:

| Section | URL | Description |
|---------|-----|-------------|
| Dashboard | `/?section=dashboard` | Overview and summary widgets |
| Live Feeds | `/?section=feeds` | Multi-camera live monitoring wall |
| Map | `/?section=map` | Geographic camera locations |
| Search | `/?section=search` | Natural-language semantic video search |
| Events & Alerts | `/?section=events` | Detection timeline and alert history |
| Recordings | `/?section=recordings` | DVR history and playback |
| Settings | `/?section=settings` | System and camera configuration |

Click sidebar items to switch sections. The URL updates automatically.

---

## 4. Dashboard

The main dashboard provides an at-a-glance overview of the surveillance system:

- Active camera count and status
- Recent detections summary
- Quick links to Live Feeds and Search
- System status indicators

---

## 5. Feature Guide

### 5.1 Live Feed Wall

**Purpose:** Monitor multiple camera feeds in real time with AI overlay and alerts.

**Steps:**
1. Navigate to **Live Feeds** section.
2. If prompted, **allow webcam access** in your browser.
3. Each tile represents a camera feed:
   - **Webcam tiles:** Your browser camera (IDs 1–9 by default)
   - **RTSP tiles:** Server-side cameras (no browser preview)
4. Look for status indicators:
   - **REC** badge — continuous recording active (MediaRecorder)
   - **Live AI Connected** — WebSocket connected (requires `NEXT_PUBLIC_ENABLE_LIVE_WS=true`)
5. When a live alert fires, the affected tile highlights with a colored border and bounding box overlay.

**Live vs. Recording:**
- **Live frames** (JPEG at ~1 FPS) power real-time AI alerts.
- **Recording** (MediaRecorder segments) powers search and playback.
- These operate independently — you can have recording without live AI and vice versa.

### 5.2 Semantic Search

**Purpose:** Find video moments using natural language.

**Steps:**
1. Navigate to **Search** section.
2. Enter a descriptive query, e.g.:
   - "person wearing red jacket"
   - "white car at night"
   - "crowd near entrance"
3. Optionally filter by camera.
4. Click **Search**.
5. Results show:
   - Thumbnail preview
   - Similarity score
   - Camera ID and timestamp offset
   - Event labels (e.g., "Vehicle detected")
6. Click a result to play the video at the matched timestamp.

**If no results:**
- Wait for AI indexing to complete (message: "AI indexing in progress...")
- Ensure recordings have been uploaded and `ai-processor` is running
- Check semantic search status: API `GET /api/v1/semantic-search/status`

### 5.3 Events & Alerts

**Purpose:** Review YOLO detection events from processed recordings.

**Steps:**
1. Navigate to **Events & Alerts** section.
2. Browse the detection timeline.
3. Each event shows:
   - Object type (person, car, etc.)
   - Confidence score
   - Camera and absolute timestamp
   - Preview thumbnail with bounding box
4. Click an event to play the recording at the detection moment.

**Note:** This section shows **offline detections** from `ai-processor`, not ephemeral live WebSocket alerts.

### 5.4 Recordings History

**Purpose:** Browse and play stored video segments.

**Steps:**
1. Navigate to **Recordings** section (or `/recordings` page).
2. Browse paginated list with thumbnails.
3. Filter by camera or date range (if UI filters available).
4. Click a recording to open the playback player.
5. Video plays via presigned URL from object storage.

### 5.5 Video File Upload

**Purpose:** Analyze pre-recorded video files.

**Steps:**
1. Navigate to **Live Feeds** or **Recordings** section.
2. Locate the **Upload Video** component.
3. Select a supported file: MP4, MOV, AVI, or WebM.
4. Choose or confirm the target camera ID.
5. Click **Upload**.
6. Wait for AI processing (monitor via search status or detection timeline).

### 5.6 Map View

**Purpose:** Visualize camera locations geographically.

**Steps:**
1. Navigate to **Map** section.
2. Cameras with latitude/longitude appear as markers on the Leaflet map.
3. Click a marker for camera details.

> **Note:** Cameras without coordinates will not appear on the map.

### 5.7 AI Assistant

**Purpose:** Ask natural-language questions about surveillance data.

**Steps:**
1. Open the **AI Agent** panel (available in dashboard).
2. Type a question, e.g., "Show me cars from this morning."
3. Review the response.

> **Limitation:** The AI assistant is currently a **mock implementation**. Responses are hardcoded for demonstration. See [12_FUTURE_WORK.md](./12_FUTURE_WORK.md).

### 5.8 Settings

**Purpose:** Configure cameras and system preferences.

**Administrator tasks:**
- Add/edit/remove cameras
- Set RTSP URLs and credentials
- Configure camera geolocation
- View system status

---

## 6. Screen Reference

| Screen | Route | Key Components |
|--------|-------|----------------|
| Login | `/login` | Email/password form |
| Register | `/register` | Sign-up form |
| Verify | `/verify` | Email verification code |
| Dashboard | `/` | `dashboard.tsx`, section router |
| Recordings | `/recordings` | `recordings-history.tsx` |
| Live Feeds | `/?section=feeds` | `live-feed-wall.tsx` |
| Search | `/?section=search` | `text-search.tsx` |
| Events | `/?section=events` | `events-alerts.tsx` |
| Map | `/?section=map` | `map-view.tsx` |

---

## 7. Troubleshooting

### Cannot log in
- Verify email is confirmed via `/verify`
- Check Cognito configuration with administrator
- Clear cookies and retry

### Live AI not connecting
- Ensure `NEXT_PUBLIC_ENABLE_LIVE_WS=true` in frontend env
- Verify `live-detection-agent` container is running
- Check browser console for WebSocket errors
- Confirm API is reachable at configured URL

### No search results
- Wait for `ai-processor` to finish indexing segments
- Check `ai-processor` logs: `docker compose logs ai-processor`
- Verify Milvus is running: `docker compose ps milvus`
- Call `GET /api/v1/semantic-search/status`

### Recording upload fails
- Check API connectivity (`http://localhost:8000/docs`)
- Verify MinIO is running
- Check browser console for CORS or network errors
- Ensure surveillance API JWT is obtained (automatic on dashboard load)

### Video playback fails
- Presigned URLs expire (default 1 hour) — refresh the page
- Verify `MINIO_PUBLIC_URL` is browser-accessible
- Check MinIO console at `http://localhost:9001`

### Webcam not working
- Grant camera permission in browser settings
- Ensure no other application is using the webcam
- Try HTTPS in production (some browsers require secure context)

### RTSP camera not appearing
- RTSP cameras are ingested server-side; no browser preview
- Verify camera is registered in database with valid `rtsp_url`
- Check `live-detection-agent` logs for RTSP connection errors

---

## 8. FAQ

**Q: Is my webcam video stored?**  
A: Yes, if recording is active (REC badge), MediaRecorder segments are uploaded to object storage and processed by AI.

**Q: Are live alerts saved?**  
A: No. Live alerts are ephemeral WebSocket messages. Offline detections from recordings are persisted.

**Q: How long does AI indexing take?**  
A: Depends on segment length and server CPU. The `ai-processor` samples one frame every 3 seconds by default. A 10-minute segment may take several minutes to index.

**Q: Can I search live feeds?**  
A: No. Semantic search operates on stored recordings only. Live feeds provide real-time alerts.

**Q: What objects can the system detect?**  
A: person, bicycle, car, motorcycle, bus, truck, backpack (YOLOv8n COCO subset).

**Q: Who can create users?**  
A: Only users with the `admin` API role via `POST /api/v1/users`.

**Q: Is my password stored securely?**  
A: API passwords are bcrypt-hashed. Frontend passwords are managed by AWS Cognito.

---

## Related Documents

- [01_README.md](./01_README.md)
- [03_USE_CASES.md](./03_USE_CASES.md)
- [11_DEPLOYMENT_GUIDE.md](./11_DEPLOYMENT_GUIDE.md)
- [LIVE_SURVEILLANCE.md](../LIVE_SURVEILLANCE.md)
