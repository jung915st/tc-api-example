# PhotoClips — Full Implementation Plan
### Google Apps Script Web App: Google Photos Albums → Video Clips via FFmpeg

---

## Overview

This document is a **Claude Code execution guide**. Feed each prompt block sequentially.
Verify the stated acceptance criteria before moving to the next prompt.

**What this builds:**
- A deployed Google Apps Script web application
- A Vue 3 SPA frontend where users paste a Google Photos shared album URL
- Backend services that fetch all photos from the album, build a Google Slides deck,
  and export a manifest JSON file ready for video rendering
- A local Node.js + FFmpeg runner that consumes the manifest and produces an MP4

---

## Project File Structure

```
gas-photo-clips/
├── appsscript.json         # Manifest, OAuth scopes, webapp config
├── Code.gs                 # doGet, doPost router, deployment helpers
├── PhotosService.gs        # Google Photos Library REST API integration
├── SlidesService.gs        # Slide deck builder, image/PDF export
├── ExportService.gs        # Pipeline orchestrator, manifest builder
├── LogService.gs           # Structured logging → Google Sheets
├── index.html              # Vue 3 SPA (single-file, CDN, no build step)
└── ffmpeg-export.js        # Local Node.js FFmpeg runner (outside GAS)
```

---

## Execution Order

| Step | File(s) | Acceptance Criteria |
|------|---------|---------------------|
| 1 | All files (scaffold) | Project saves and compiles with zero errors |
| 2 | LogService.gs | `testLogging()` writes 4 rows to Google Sheet |
| 3 | PhotosService.gs | `testFetchAlbum(url)` returns array of photo objects |
| 4 | SlidesService.gs | `testCreateSlides()` returns a valid presentation URL |
| 5 | ExportService.gs | `testExportPipeline(url)` returns manifest Drive URL |
| 6 | ffmpeg-export.js | `node ffmpeg-export.js --manifest <url>` produces MP4 |
| 7 | index.html | SPA loads, album fetch displays album card end-to-end |
| 8 | Code.gs (router) | `checkDeploymentReadiness()` all green, web app deployed |

---

## Key Constraints (Read Before Starting)

- **FFmpeg cannot run inside GAS.** The Node.js script bridges this by consuming the manifest JSON that GAS exports to Drive.
- **Google Photos media URLs expire** in ~60 minutes. Run `ffmpeg-export.js` promptly after fetching the manifest.
- **`sharedAlbums:join`** requires the album to be publicly shared. Privately shared albums will not resolve via share token.
- **Slides API write quota**: 60 requests/minute. For albums with more than 60 photos, add `Utilities.sleep(1000)` inside the slide creation loop.
- **GAS has a 6-minute execution limit** per invocation. For albums over ~150 photos consider splitting into batches.

---

## Prompt 1 — Project Scaffold + Manifest

> **Instruction for Claude Code:** Create all project files listed below.
> Do not implement any logic yet beyond what is specified — only stubs and config.

```
Create a Google Apps Script project scaffold for a web application
called "PhotoClips". Set up the following files with exact content:

--- appsscript.json ---
{
  "timeZone": "Asia/Taipei",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE_WITH_GOOGLE_ACCOUNT",
    "executeAs": "USER_ACCESSING"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/photoslibrary.readonly",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}

--- Code.gs ---
- doGet(e): returns HtmlService.createTemplateFromFile('index').evaluate()
  with title "PhotoClips", addMetaTag for viewport, setXFrameOptionsMode ALLOWALL.
- doPost(e): parse e.postData.contents as JSON, route by action field to:
    getAlbum | exportClip | getLogs | clearLogs
  Return ContentService JSON output with { success, data, error } envelope.
  Set Content-Type: application/json.
- include(filename): helper for HtmlService template partials.

--- PhotosService.gs ---
Comment header: "Handles all Google Photos Library REST API calls."
Stub functions: parseAlbumUrl, resolveSharedAlbum, getAlbumPhotos,
getDownloadUrl, getAuthToken, buildHeaders.

--- SlidesService.gs ---
Comment header: "Builds Google Slides presentations from photo arrays."
Stub functions: createFromPhotos, setAutoAdvance, exportToPdf,
exportSlideImages, deletePresentation.

--- ExportService.gs ---
Comment header: "Orchestrates the full photo-to-manifest export pipeline."
Stub functions: exportAlbumClip, buildManifest, buildFfmpegCommand,
saveManifestToDrive.

--- LogService.gs ---
Comment header: "Structured logging to Google Sheets with console fallback."
Stub functions: initLogSheet, info, warn, error, debug, getLogs, clearLogs.

--- index.html ---
Minimal HTML shell: <!DOCTYPE html> with a <div id="app">Loading...</div>.
Include Vue 3 from https://unpkg.com/vue@3/dist/vue.global.js
Include Tailwind CSS from https://cdn.tailwindcss.com

After creating all files, verify the project compiles without errors by
checking that no syntax errors exist in any .gs file.
```

**Acceptance criteria:** All 7 files exist. No compilation errors. `doGet` returns an HTML page.

---

## Prompt 2 — LogService.gs

> **Instruction for Claude Code:** Fully implement LogService.gs.
> This module is used by every other service, so it must be complete before continuing.

```
Fully implement LogService.gs with a structured logging system backed
by a Google Sheet. Replace all stubs with working code.

SHEET SETUP:
- initLogSheet():
  - Check PropertiesService.scriptProperties for key 'LOG_SPREADSHEET_ID'.
  - If found, open that spreadsheet. If not found, create a new Spreadsheet
    named "PhotoClips Logs" via SpreadsheetApp.create(), store its ID in
    PropertiesService.scriptProperties with key 'LOG_SPREADSHEET_ID'.
  - Find or create a sheet tab named "PhotoClipsLog".
  - If the sheet is brand new (row count <= 1), write header row:
    ['Timestamp', 'Level', 'Module', 'Action', 'Message', 'Metadata']
    and bold the header row, freeze row 1.
  - Return the sheet object.

LOGGING FUNCTIONS — implement all four: info, warn, error, debug.
Each function signature: (module, action, message, metadata)
  - metadata is optional, defaults to null.
  - Call initLogSheet() to get the sheet.
  - Append one row: [new Date().toISOString(), LEVEL, module, action,
    message, metadata ? JSON.stringify(metadata) : '']
  - Also call the matching console method (console.log/warn/error) with
    a formatted string: "[LEVEL][module][action] message"
  - Wrap the entire function body in try/catch — if sheet append fails,
    fall back to console only. Logging must never crash the caller.

RETRIEVAL:
- getLogs(limit):
  - limit defaults to 200.
  - Get all data rows from the log sheet (getDataRange().getValues()).
  - Skip header row (index 0).
  - Return last N rows as array of objects:
    { timestamp, level, module, action, message, metadata }
  - Newest first (reverse the array before slicing).

- clearLogs():
  - Delete all rows below the header row.
  - Use sheet.deleteRows(2, sheet.getLastRow() - 1) only if lastRow > 1.
  - Log one INFO row after clearing: "Log cleared".

TEST FUNCTION:
- testLogging():
  - Call LogService.info('Test', 'testRun', 'Info message', {foo: 'bar'})
  - Call LogService.warn('Test', 'testRun', 'Warn message')
  - Call LogService.error('Test', 'testRun', 'Error message', {code: 500})
  - Call LogService.debug('Test', 'testRun', 'Debug message')
  - Call getLogs(10) and log the result to console.
  - Log the spreadsheet URL to console so it can be verified.
```

**Acceptance criteria:** Run `testLogging()` from the GAS editor. Verify 4 rows appear in the Google Sheet with correct columns.

---

## Prompt 3 — PhotosService.gs

> **Instruction for Claude Code:** Fully implement PhotosService.gs.
> Replace all stubs with working code. Use LogService for all logging.

```
Fully implement PhotosService.gs to fetch albums and photos via the
Google Photos Library REST API using UrlFetchApp.

OAUTH HELPERS:
- getAuthToken(): return ScriptApp.getOAuthToken()
- buildHeaders(): return {
    'Authorization': 'Bearer ' + getAuthToken(),
    'Content-Type': 'application/json'
  }

PARSE ALBUM URL — parseAlbumUrl(url):
  Handle these URL patterns:
    https://photos.app.goo.gl/{token}         → type: 'share'
    https://photos.google.com/share/{token}   → type: 'share'
    https://photos.google.com/album/{albumId} → type: 'album'
    https://photos.google.com/u/0/album/{id}  → type: 'album'
  Use regex to extract token or albumId.
  LogService.debug('PhotosService', 'parseAlbumUrl', 'Parsing URL', {url})
  If no pattern matches, throw new Error('Unrecognised Google Photos URL format')
  Return { type, token } where token is either the share token or albumId.

RESOLVE SHARED ALBUM — resolveSharedAlbum(shareToken):
  If type is 'album', skip this step and return { id: shareToken }.
  POST to https://photoslibrary.googleapis.com/v1/sharedAlbums:join
  Body: JSON.stringify({ shareToken })
  Headers: buildHeaders()
  muteHttpExceptions: true
  Check response.getResponseCode(). If not 200, parse error body, call
  LogService.error with status and body, throw descriptive Error.
  Parse response JSON, extract sharedAlbum object.
  LogService.info('PhotosService', 'resolveSharedAlbum',
    'Album resolved: ' + album.title,
    { id: album.id, mediaItemsCount: album.mediaItemsCount })
  Return the album object.

FETCH ALL MEDIA ITEMS — getAlbumPhotos(albumId):
  Initialize: items = [], pageToken = null, pageNum = 0.
  Loop:
    POST https://photoslibrary.googleapis.com/v1/mediaItems:search
    Body: { albumId, pageSize: 100, pageToken: pageToken || undefined }
    Headers: buildHeaders()
    muteHttpExceptions: true
    Check response code, throw on error.
    Parse JSON. Extend items with response.mediaItems (filter for
    mimeType starting with 'image/').
    pageNum++
    Log every page: LogService.debug('PhotosService', 'getAlbumPhotos',
      'Fetched page ' + pageNum, { count: items.length })
    Break if no nextPageToken.
    pageToken = response.nextPageToken
  LogService.info('PhotosService', 'getAlbumPhotos',
    'All photos fetched', { total: items.length, albumId })
  Return items array. Each item has: { id, filename, baseUrl,
  mimeType, mediaMetadata: { width, height, creationTime } }

GET DOWNLOAD URL — getDownloadUrl(baseUrl, width, height):
  width defaults to 1920, height defaults to 1080.
  Return baseUrl + '=w' + width + '-h' + height

TEST FUNCTION — testFetchAlbum(shareUrl):
  parsed = PhotosService.parseAlbumUrl(shareUrl)
  album = PhotosService.resolveSharedAlbum(parsed.token)
  photos = PhotosService.getAlbumPhotos(album.id)
  console.log('Album:', album.title, '| Photos:', photos.length)
  console.log('First photo filename:', photos[0]?.filename)
  console.log('First download URL:', PhotosService.getDownloadUrl(
    photos[0]?.baseUrl))
```

**Acceptance criteria:** Run `testFetchAlbum('YOUR_SHARED_ALBUM_URL')` with a real shared album. Console shows album title and photo count. No errors.

---

## Prompt 4 — SlidesService.gs

> **Instruction for Claude Code:** Fully implement SlidesService.gs.
> Replace all stubs with working code. Use LogService for all logging.

```
Fully implement SlidesService.gs to create Google Slides presentations
from photo item arrays and export them in multiple formats.

CREATE PRESENTATION — createFromPhotos(albumTitle, photoItems, options):
  options defaults: { width: 1920, height: 1080, secondsPerSlide: 3 }
  Steps:
  1. Create presentation: SlidesApp.create(albumTitle + ' — PhotoClips')
  2. Get presentationId from .getId()
  3. Set page size via Slides REST API:
     PATCH https://slides.googleapis.com/v1/presentations/{id}
     body: { pageSize: {
       width: { magnitude: options.width * 9144, unit: 'EMU' },
       height: { magnitude: options.height * 9144, unit: 'EMU' }
     }}
     Headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
                Content-Type: 'application/json' }
  4. Delete the default first slide (presentation.getSlides()[0].remove())
  5. Loop through photoItems:
     a. slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK)
     b. Remove all elements: slide.getPageElements().forEach(e => e.remove())
     c. downloadUrl = PhotosService.getDownloadUrl(item.baseUrl,
          options.width, options.height)
     d. slide.insertImage(downloadUrl, 0, 0,
          options.width * 9144 / 914400 * 72,  // convert EMU to points
          options.height * 9144 / 914400 * 72)
        NOTE: SlidesApp uses points. 1 point = 12700 EMU.
        So width in points = options.width * 9144 / 12700
     e. Every 10 slides: LogService.debug('SlidesService', 'createFromPhotos',
          'Progress', { done: i+1, total: photoItems.length })
     f. After every slide: Utilities.sleep(500) to respect API quota
  6. LogService.info('SlidesService', 'createFromPhotos', 'Deck created',
       { slideCount: photoItems.length, url: presentation.getUrl() })
  7. Return { presentationId, presentationUrl: presentation.getUrl(),
              slideCount: photoItems.length }

EXPORT SLIDE IMAGES — exportSlideImages(presentationId, slideCount):
  Get all page IDs:
    GET https://slides.googleapis.com/v1/presentations/{id}
    Extract pages array, map to pageId.
  For each pageId (0..slideCount-1):
    GET https://slides.googleapis.com/v1/presentations/{id}/pages/{pageId}/thumbnail
    ?thumbnailProperties.thumbnailSize=LARGE
    &thumbnailProperties.mimeType=JPEG
    Parse response, get { contentUrl }.
    Utilities.sleep(300) between requests.
  LogService.info('SlidesService', 'exportSlideImages',
    'Thumbnails fetched', { count: results.length })
  Return array of { slideIndex, pageId, contentUrl }

EXPORT TO PDF — exportToPdf(presentationId, filename):
  url = 'https://docs.google.com/presentation/d/' + presentationId + '/export/pdf'
  response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  })
  blob = response.getBlob().setName(filename + '.pdf')
  file = DriveApp.createFile(blob)
  LogService.info('SlidesService', 'exportToPdf', 'PDF saved',
    { fileId: file.getId(), size: blob.getBytes().length })
  Return { fileId: file.getId(), fileUrl: file.getUrl(), filename }

DELETE PRESENTATION — deletePresentation(presentationId):
  DriveApp.getFileById(presentationId).setTrashed(true)
  LogService.info('SlidesService', 'deletePresentation',
    'Presentation trashed', { presentationId })

TEST FUNCTION — testCreateSlides():
  Use 3 hardcoded public image URLs (any stable public JPG URLs).
  fakeItems = [
    { baseUrl: 'https://picsum.photos/id/10/1920/1080' },
    { baseUrl: 'https://picsum.photos/id/20/1920/1080' },
    { baseUrl: 'https://picsum.photos/id/30/1920/1080' }
  ]
  Override getDownloadUrl to just return baseUrl as-is for testing.
  result = SlidesService.createFromPhotos('Test Album', fakeItems, {})
  console.log('Presentation URL:', result.presentationUrl)
  images = SlidesService.exportSlideImages(result.presentationId,
    result.slideCount)
  console.log('Slide image URLs:', images.map(i => i.contentUrl))
```

**Acceptance criteria:** Run `testCreateSlides()`. A 3-slide presentation appears in Google Drive. Console logs the URL and 3 thumbnail URLs.

---

## Prompt 5 — ExportService.gs

> **Instruction for Claude Code:** Fully implement ExportService.gs.
> Replace all stubs with working code. This is the main pipeline orchestrator.

```
Fully implement ExportService.gs to orchestrate the full export pipeline
and produce a manifest JSON file in Google Drive.

MAIN ORCHESTRATOR — exportAlbumClip(albumUrl, options):
  options defaults: {
    secondsPerSlide: 3,
    resolution: '1920x1080',
    keepPresentation: false
  }
  Pipeline:
  1. LogService.info('ExportService', 'exportAlbumClip', 'Export started',
       { albumUrl, options })
  2. parsed = PhotosService.parseAlbumUrl(albumUrl)
  3. album = PhotosService.resolveSharedAlbum(parsed.token)
     If parsed.type === 'album': album = { id: parsed.token, title: 'Album' }
  4. photos = PhotosService.getAlbumPhotos(album.id)
  5. [width, height] = options.resolution.split('x').map(Number)
  6. deck = SlidesService.createFromPhotos(album.title, photos,
       { width, height, secondsPerSlide: options.secondsPerSlide })
  7. images = SlidesService.exportSlideImages(deck.presentationId,
       deck.slideCount)
  8. manifest = buildManifest(album, deck, images, options)
  9. manifestFile = saveManifestToDrive(manifest, album.title)
  10. if (!options.keepPresentation):
        SlidesService.deletePresentation(deck.presentationId)
  11. LogService.info('ExportService', 'exportAlbumClip', 'Export complete',
        { manifestUrl: manifestFile.fileUrl, photoCount: photos.length })
  12. Return {
        success: true,
        albumTitle: album.title,
        photoCount: photos.length,
        slideCount: deck.slideCount,
        manifestUrl: manifestFile.fileUrl,
        ffmpegCommand: manifest.ffmpegCommand,
        manifest
      }

BUILD MANIFEST — buildManifest(album, deck, images, options):
  Return object:
  {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    album: {
      id: album.id,
      title: album.title,
      photoCount: images.length
    },
    export: {
      secondsPerSlide: options.secondsPerSlide,
      resolution: options.resolution,
      slideCount: deck.slideCount
    },
    slides: images.map((img, i) => ({
      index: i,
      slideIndex: img.slideIndex,
      imageUrl: img.contentUrl,
      filename: 'slide_' + String(i).padStart(3, '0') + '.jpg'
    })),
    ffmpegCommand: buildFfmpegCommand(options)
  }

BUILD FFMPEG COMMAND — buildFfmpegCommand(options):
  [w, h] = options.resolution.split('x')
  Return the string (single line with line-continuation for readability
  in the manifest):
  ffmpeg -framerate 1/{secondsPerSlide} -i slide_%03d.jpg \
    -vf "scale={w}:{h}:force_original_aspect_ratio=decrease,\
pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4

SAVE MANIFEST — saveManifestToDrive(manifest, albumTitle):
  folderName = 'PhotoClips Exports'
  folders = DriveApp.getFoldersByName(folderName)
  folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName)
  safeName = albumTitle.replace(/[^a-z0-9]/gi, '_')
  filename = safeName + '_' + Date.now() + '_manifest.json'
  blob = Utilities.newBlob(
    JSON.stringify(manifest, null, 2),
    'application/json',
    filename
  )
  file = folder.createFile(blob)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)
  LogService.info('ExportService', 'saveManifestToDrive', 'Manifest saved',
    { fileUrl: file.getUrl(), filename })
  Return { fileId: file.getId(), fileUrl: file.getUrl(), filename }

TEST FUNCTION — testExportPipeline(albumUrl):
  result = ExportService.exportAlbumClip(albumUrl, {
    secondsPerSlide: 3,
    resolution: '1280x720',
    keepPresentation: true
  })
  console.log('Manifest URL:', result.manifestUrl)
  console.log('FFmpeg command:', result.ffmpegCommand)
  console.log('Slide count:', result.slideCount)
```

**Acceptance criteria:** Run `testExportPipeline('YOUR_SHARED_ALBUM_URL')`. A manifest JSON file appears in Drive folder "PhotoClips Exports". Console shows manifest URL and FFmpeg command.

---

## Prompt 6 — Node.js FFmpeg Runner (`ffmpeg-export.js`)

> **Instruction for Claude Code:** Create ffmpeg-export.js in the project root (outside GAS).
> This runs locally, NOT inside Apps Script.

```
Create ffmpeg-export.js — a standalone Node.js script that downloads
slide images from a PhotoClips manifest and renders an MP4 via FFmpeg.

DEPENDENCIES:
  In package.json, add:
  {
    "name": "photoclips-ffmpeg-runner",
    "version": "1.0.0",
    "dependencies": {
      "node-fetch": "2",
      "fluent-ffmpeg": "^2.1.2",
      "@ffmpeg-installer/ffmpeg": "^1.1.0"
    }
  }
  Use require() — CommonJS only (node-fetch v2 is CJS compatible).

FILE HEADER COMMENT (place at very top):
/**
 * PhotoClips FFmpeg Runner
 * ------------------------
 * Prerequisites:
 *   Node.js 18+
 *   npm install
 *
 * Usage:
 *   node ffmpeg-export.js --manifest <URL_or_path> [--output clip.mp4]
 *
 * Auth (for downloading Google Photos thumbnail URLs):
 *   export GOOGLE_TOKEN=$(gcloud auth print-access-token)
 *   or paste a token: export GOOGLE_TOKEN=ya29.xxxxx
 *
 * Example:
 *   node ffmpeg-export.js \
 *     --manifest "https://drive.google.com/uc?export=download&id=FILE_ID" \
 *     --output "my_album.mp4"
 */

IMPLEMENTATION:

1. SETUP:
   const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg')
   const ffmpeg = require('fluent-ffmpeg')
   const fetch = require('node-fetch')
   const fs = require('fs'), path = require('path'), os = require('os')
   ffmpeg.setFfmpegPath(ffmpegInstaller.path)

2. PARSE CLI ARGS:
   Parse process.argv for: --manifest, --output, --fps, --resolution
   Print usage and process.exit(1) if --manifest is missing.

3. LOAD MANIFEST:
   async function loadManifest(source):
     If source starts with 'http': fetch it (no auth needed for Drive
     public link), return JSON.
     Else: fs.readFileSync + JSON.parse.

4. DOWNLOAD PHASE:
   async function downloadSlides(slides, tmpDir):
     const token = process.env.GOOGLE_TOKEN
     const headers = token ? { Authorization: 'Bearer ' + token } : {}
     For each slide (with concurrency limit of 5 at a time using
     a simple batch-of-5 loop with Promise.all):
       response = await fetch(slide.imageUrl, { headers })
       if (!response.ok) throw Error('Download failed: ' + slide.filename
         + ' HTTP ' + response.status)
       buffer = await response.buffer()
       fs.writeFileSync(path.join(tmpDir, slide.filename), buffer)
       console.log('[DOWNLOAD] ' + (i+1) + '/' + slides.length
         + ' — ' + slide.filename)
     console.log('[DOWNLOAD] Complete. ' + slides.length + ' images saved.')

5. FFMPEG PHASE:
   function renderVideo(tmpDir, manifest, outputPath):
     Return a Promise that resolves/rejects.
     Use fluent-ffmpeg:
       ffmpeg()
         .input(path.join(tmpDir, 'slide_%03d.jpg'))
         .inputOptions([
           '-framerate', '1/' + manifest.export.secondsPerSlide,
           '-pattern_type', 'sequence'
         ])
         .videoFilters([
           'scale=' + manifest.export.resolution.replace('x', ':')
             + ':force_original_aspect_ratio=decrease',
           'pad=' + manifest.export.resolution.replace('x', ':')
             + ':(ow-iw)/2:(oh-ih)/2',
           'setsar=1'
         ])
         .videoCodec('libx264')
         .outputOptions(['-pix_fmt', 'yuv420p', '-movflags', '+faststart'])
         .output(outputPath)
         .on('start', cmd =>
           console.log('[FFMPEG] Command:\n' + cmd))
         .on('progress', p =>
           process.stdout.write('\r[FFMPEG] Progress: '
             + (p.percent || 0).toFixed(1) + '% — ' + p.timemark
             + '          '))
         .on('end', () => {
           console.log('\n[FFMPEG] Encoding complete → ' + outputPath)
           resolve(outputPath)
         })
         .on('error', err => {
           console.error('\n[FFMPEG] Error: ' + err.message)
           reject(err)
         })
         .run()

6. CLEANUP:
   function cleanup(tmpDir):
     fs.rmSync(tmpDir, { recursive: true, force: true })
     console.log('[CLEANUP] Temp directory removed.')

7. MAIN:
   async function main():
     manifest = await loadManifest(args.manifest)
     console.log('[INFO] Album:', manifest.album.title)
     console.log('[INFO] Slides:', manifest.export.slideCount)
     console.log('[INFO] Seconds/slide:', manifest.export.secondsPerSlide)

     safeName = manifest.album.title.replace(/[^a-z0-9]/gi, '_')
     outputPath = args.output || safeName + '.mp4'

     tmpDir = path.join(os.tmpdir(), 'photoclips_' + Date.now())
     fs.mkdirSync(tmpDir, { recursive: true })
     console.log('[INFO] Temp dir:', tmpDir)

     try:
       await downloadSlides(manifest.slides, tmpDir)
       await renderVideo(tmpDir, manifest, outputPath)
       stats = fs.statSync(outputPath)
       console.log('[DONE] Output file:', outputPath)
       console.log('[DONE] File size:', (stats.size / 1024 / 1024).toFixed(2) + ' MB')
     finally:
       cleanup(tmpDir)

   main().catch(err => {
     console.error('[FATAL]', err.message)
     process.exit(1)
   })
```

**Acceptance criteria:** Run `npm install` then `node ffmpeg-export.js --manifest ./test-manifest.json` with a local manifest. Slides download to temp dir, FFmpeg runs, MP4 is created in working directory.

---

## Prompt 7 — Vue 3 SPA Frontend (`index.html`)

> **Instruction for Claude Code:** Fully implement index.html.
> Single file, no build step. Vue 3 + Tailwind from CDN only.

```
Fully implement index.html as a Vue 3 SPA for the PhotoClips GAS web app.
No build step. All dependencies from CDN.

CDN IMPORTS:
  Vue 3:    https://unpkg.com/vue@3/dist/vue.global.js
  Tailwind: https://cdn.tailwindcss.com

PAGE STRUCTURE (top to bottom, no router):
  <header>     — App name + subtitle
  <main>
    #import-panel
    #export-panel   (v-show: album !== null)
    #result-panel   (v-show: exportResult !== null)
  <footer>
    #log-panel      (always visible, collapsible)

--- HEADER ---
  "PhotoClips" in large bold text.
  Subtitle: "Google Photos albums → MP4 via FFmpeg"
  Right side: small badge showing auth status (always "Authenticated"
  since GAS handles auth).

--- IMPORT PANEL ---
  Card with title "1. Paste Album URL"
  Textarea (4 rows) bound to albumUrl, placeholder:
    "https://photos.app.goo.gl/..."
  Below: "Fetch Album" button.
    - Disabled and shows spinner when phase === 'fetching'.
    - Calls callServer('getAlbum', { albumUrl }).
  On success: render album card below the button:
    Cover image: <img :src="album.coverPhotoBaseUrl + '=w400-h200-c'">
    Album title (large), photo count badge (e.g. "42 photos")
    Green "Photos loaded ✓" badge.
  On error: red error alert box with errorMessage.

--- EXPORT PANEL (v-show: album !== null) ---
  Card with title "2. Export Settings"
  Row 1: Label "Seconds per slide" + <input type="number" min="1" max="10">
    bound to exportOptions.secondsPerSlide.
  Row 2: Checkbox "Keep presentation in Drive" bound to
    exportOptions.keepPresentation.
  "Export Clip" button:
    - Full width, prominent styling.
    - Disabled when phase === 'exporting'.
    - Shows spinner + "Exporting… this may take several minutes" when
      phase === 'exporting'.
    - Calls callServer('exportClip', { albumUrl,
        secondsPerSlide: exportOptions.secondsPerSlide,
        keepPresentation: exportOptions.keepPresentation })
    - On success: set exportResult, set phase to 'done'.
    - On error: set errorMessage, set phase to 'error'.

--- RESULT PANEL (v-show: exportResult !== null) ---
  Card with title "3. Export Complete"
  Green success banner: "Manifest ready — run the FFmpeg command below"
  Manifest URL: clickable link (opens in new tab).
  FFmpeg command: <pre> block with monospace font, dark background.
  "Copy Command" button: copies ffmpegCommand to clipboard via
    navigator.clipboard.writeText(), shows "Copied!" for 2 seconds.
  "Download Manifest" link: href to manifestUrl with download attribute.
  "Export Another Album" button: resets all state.

--- LOG PANEL ---
  Section header "Debug Log" with toggle chevron (▼/▶).
  Collapsed by default (logsExpanded = false).
  When expanded:
    Row of buttons: "Refresh" | "Clear Logs" | "Auto-refresh: ON/OFF"
    Auto-refresh: setInterval every 5s while autoRefresh is true AND
      phase === 'exporting'.
    Log table columns: Time | Level | Module | Action | Message
      (Time: show only HH:MM:SS portion of ISO string)
    Level badges:
      INFO  → blue  background + text
      WARN  → amber background + text
      ERROR → red   background + text
      DEBUG → gray  background + text
    Each row clickable: toggles expanded metadata row below it showing
      <pre> of metadata JSON (or "—" if empty).
    Empty state: "No logs yet. Click Refresh."
    Max display: 200 rows, newest first.

SERVER CALL FUNCTION:
  async function callServer(action, payload):
    const scriptUrl = window.location.href.split('?')[0]
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ action, ...payload })
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Server error')
    return data.data

VUE APP STATE:
  albumUrl: ''
  album: null          // { title, photoCount, coverPhotoBaseUrl }
  exportOptions: { secondsPerSlide: 3, keepPresentation: false }
  exportResult: null   // { manifestUrl, ffmpegCommand, albumTitle,
                       //   photoCount, slideCount }
  phase: 'idle'        // idle | fetching | exporting | done | error
  errorMessage: ''
  logs: []
  logsExpanded: false
  autoRefresh: false
  selectedLogIndex: null  // for metadata expand/collapse

METHODS:
  fetchAlbum()       — calls callServer, updates album state
  exportClip()       — calls callServer, starts auto-refresh, updates result
  fetchLogs()        — calls callServer('getLogs'), updates logs
  clearLogs()        — calls callServer('clearLogs'), then fetchLogs()
  copyCommand()      — clipboard copy with 2s feedback
  resetAll()         — clears all state to initial values
  toggleLog(index)   — toggles selectedLogIndex for metadata row
  formatTime(iso)    — returns HH:MM:SS from ISO string
```

**Acceptance criteria:** Deploy the web app (see Prompt 8). Open the URL. Paste a shared album URL, click Fetch Album — album card appears. Open the Log Panel and click Refresh — log rows appear.

---

## Prompt 8 — doPost Router + Deployment Checklist

> **Instruction for Claude Code:** Update Code.gs with the complete doPost router,
> CORS headers, error envelope, and deployment helper function.

```
Update Code.gs with the complete, production-ready implementation.

DOPOST COMPLETE ROUTER:
function doPost(e) {
  let action = ''
  try {
    const body = JSON.parse(e.postData.contents)
    action = body.action

    LogService.debug('Router', action, 'Request received', body)

    let result
    switch (action) {
      case 'getAlbum': {
        const parsed = PhotosService.parseAlbumUrl(body.albumUrl)
        let album
        if (parsed.type === 'share') {
          album = PhotosService.resolveSharedAlbum(parsed.token)
        } else {
          album = { id: parsed.token, title: 'Album', coverPhotoBaseUrl: '' }
        }
        const photos = PhotosService.getAlbumPhotos(album.id)
        result = {
          title: album.title,
          photoCount: photos.length,
          coverPhotoBaseUrl: album.coverPhotoBaseUrl || ''
        }
        break
      }
      case 'exportClip': {
        result = ExportService.exportAlbumClip(body.albumUrl, {
          secondsPerSlide: Number(body.secondsPerSlide) || 3,
          resolution: body.resolution || '1920x1080',
          keepPresentation: Boolean(body.keepPresentation)
        })
        break
      }
      case 'getLogs': {
        result = LogService.getLogs(body.limit || 200)
        break
      }
      case 'clearLogs': {
        LogService.clearLogs()
        result = { cleared: true }
        break
      }
      default:
        throw new Error('Unknown action: ' + action)
    }

    return buildResponse({ success: true, data: result })

  } catch (err) {
    LogService.error('Router', action, err.message, {
      stack: err.stack,
      action
    })
    return buildResponse({ success: false, error: err.message })
  }
}

RESPONSE BUILDER:
function buildResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}

DOGET — ensure it sets the page title and meta:
function doGet(e) {
  return HtmlService
    .createTemplateFromFile('index')
    .evaluate()
    .setTitle('PhotoClips')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
}

DEPLOYMENT READINESS CHECK:
function checkDeploymentReadiness() {
  const checks = [
    {
      name: 'OAuth token',
      fn: () => {
        const tok = ScriptApp.getOAuthToken()
        return 'Token length: ' + tok.length
      }
    },
    {
      name: 'LogService sheet',
      fn: () => {
        LogService.info('DeployCheck', 'test', 'Readiness check ping')
        return 'Log sheet writable'
      }
    },
    {
      name: 'Google Photos API reachable',
      fn: () => {
        const res = UrlFetchApp.fetch(
          'https://photoslibrary.googleapis.com/v1/albums?pageSize=1',
          { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
            muteHttpExceptions: true }
        )
        return 'HTTP ' + res.getResponseCode()
      }
    },
    {
      name: 'Slides API reachable',
      fn: () => {
        const p = SlidesApp.create('_readiness_test_delete_me')
        DriveApp.getFileById(p.getId()).setTrashed(true)
        return 'Slides create+trash OK'
      }
    },
    {
      name: 'Drive access',
      fn: () => 'Root folder: ' + DriveApp.getRootFolder().getName()
    }
  ]

  checks.forEach(check => {
    try {
      const result = check.fn()
      console.log('✓ ' + check.name + ': ' + result)
    } catch (err) {
      console.error('✗ ' + check.name + ': ' + err.message)
    }
  })
}

DEPLOYMENT STEPS (add as comment block at top of Code.gs):
/*
 * DEPLOYMENT STEPS
 * ================
 * 1. Save all files in the Apps Script editor.
 * 2. Run checkDeploymentReadiness() and resolve any ✗ failures.
 * 3. Click Deploy → New deployment.
 *    - Type: Web app
 *    - Execute as: User accessing the web app
 *    - Who has access: Anyone with a Google Account
 * 4. Copy the web app URL from the deployment dialog.
 * 5. Open index.html — the callServer() function uses window.location.href,
 *    so no URL hardcoding is needed.
 * 6. Re-deploy as a new version after any code changes.
 * 7. Share the web app URL with users.
 *
 * TROUBLESHOOTING
 * ===============
 * - "Exception: You do not have permission to access the requested document"
 *   → Check oauthScopes in appsscript.json, re-authorize.
 * - "sharedAlbums:join 403"
 *   → Album must be publicly shared, not just shared with individuals.
 * - "Slides API 429 Too Many Requests"
 *   → Increase Utilities.sleep() in SlidesService.createFromPhotos loop.
 * - FFmpeg "No such file or directory: slide_000.jpg"
 *   → Image download failed. Check GOOGLE_TOKEN env var.
 */
```

**Acceptance criteria:** Run `checkDeploymentReadiness()` — all 5 checks show ✓. Deploy as web app. Open the deployed URL — SPA loads. Submit a real album URL — full pipeline runs end-to-end and manifest URL is returned.

---

## Post-Deployment: Run the FFmpeg Runner

After the web app returns a manifest URL:

```bash
# Install dependencies (one time)
cd gas-photo-clips
npm install

# Get a Google auth token (requires gcloud CLI)
export GOOGLE_TOKEN=$(gcloud auth print-access-token)

# Run the export — paste your manifest URL from the web app
node ffmpeg-export.js \
  --manifest "https://drive.google.com/uc?export=download&id=YOUR_FILE_ID" \
  --output "my_album_clip.mp4"
```

The manifest URL from the web app is a Drive sharing link. To get a direct download link, replace:
```
https://drive.google.com/file/d/FILE_ID/view
```
with:
```
https://drive.google.com/uc?export=download&id=FILE_ID
```

---

## Troubleshooting Reference

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `sharedAlbums:join` returns 403 | Album not publicly shared | Re-share album → "Anyone with link" |
| Slides creation stops at slide 60 | API quota hit | Increase `Utilities.sleep(1000)` per slide |
| GAS execution timeout (6 min) | Album too large | Process in batches of 50 photos |
| FFmpeg `slide_000.jpg: No such file` | Download failed | Check `GOOGLE_TOKEN`, re-export manifest |
| `Cannot read properties of null` in frontend | `doPost` returned non-JSON | Check Apps Script execution log |
| Drive manifest file is empty | JSON stringify failed on circular ref | Check ExportService.buildManifest output |
| Photos API returns 401 | Token expired mid-run | Re-run export (token is fresh per GAS execution) |

---

## Optional Enhancements (post-MVP)

- **Add background music**: Pass an audio file URL to FFmpeg with `-i audio.mp3 -shortest`.
- **Crossfade transitions**: Use FFmpeg `xfade` filter between slides.
- **Progress polling**: Add a `getExportStatus` action backed by PropertiesService
  so the frontend can poll long-running exports.
- **Batch albums**: Accept multiple album URLs, produce one clip per album.
- **Drive output upload**: After FFmpeg renders the MP4, upload it back to Drive
  using the Drive API from Node.js.
- **Email notification**: Use GAS MailApp to email the manifest URL when export completes.
