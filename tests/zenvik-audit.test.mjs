import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readFile = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');
const exists = (relPath) => fs.existsSync(path.join(root, relPath));

test('Phase 3: Apps & Installation Center navigation and truthful UI', () => {
  assert.ok(exists('src/views/AppsCenterView.tsx'), 'AppsCenterView.tsx must exist');
  const appsCenter = readFile('src/views/AppsCenterView.tsx');

  // Verify APK download URL & package metadata
  assert.match(
    appsCenter,
    /https:\/\/github\.com\/FazleRabbe121\/ZENVIK-AGENT/,
    'AppsCenterView must reference the official GitHub repository'
  );
  assert.match(
    appsCenter,
    /\/releases\/latest\/download\/ZENVIK-AGENT-debug\.apk/,
    'AppsCenterView must contain the latest Android APK download path'
  );
  assert.match(appsCenter, /com\.ccd\.abetteryou/, 'AppsCenterView must display package ID com.ccd.abetteryou');
  assert.match(appsCenter, /1\.0\.0/, 'AppsCenterView must display version 1.0.0');

  // Verify truthful PWA status handling (no fake success or window.alert)
  assert.doesNotMatch(appsCenter, /\balert\s*\(/, 'AppsCenterView must not use window.alert');
  assert.match(appsCenter, /beforeinstallprompt/, 'AppsCenterView must listen for beforeinstallprompt');
  assert.match(appsCenter, /display-mode:\s*standalone/, 'AppsCenterView must detect standalone PWA mode');

  // Verify SidebarNav, BottomNav, App.tsx integration
  const sidebarNav = readFile('src/components/SidebarNav.tsx');
  assert.match(sidebarNav, /'apps-center'/, 'SidebarNav must include apps-center tab');

  const bottomNav = readFile('src/components/BottomNav.tsx');
  assert.match(bottomNav, /'apps-center'/, 'BottomNav must include apps-center tab');

  const appTsx = readFile('src/App.tsx');
  assert.match(appTsx, /AppsCenterView/, 'App.tsx must import and render AppsCenterView');
  assert.match(appTsx, /currentTab === 'apps-center'/, 'App.tsx must route apps-center tab');

  // Verify AndroidExportModal has no blocking alert()
  const exportModal = readFile('src/components/AndroidExportModal.tsx');
  assert.doesNotMatch(exportModal, /\balert\s*\(/, 'AndroidExportModal must not call alert()');
});

test('Phase 4: PWA Manifest and index.html accessibility compliance', () => {
  const manifest = JSON.parse(readFile('public/manifest.json'));
  assert.equal(manifest.id, '/', 'manifest.json must define id: "/"');
  assert.equal(manifest.scope, '/', 'manifest.json must define scope: "/"');
  assert.equal(manifest.start_url, '/', 'manifest.json must define start_url: "/"');
  assert.equal(manifest.display, 'standalone', 'manifest.json must use standalone display mode');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest.json must include icons');

  const html = readFile('index.html');
  assert.doesNotMatch(html, /user-scalable=no/, 'index.html must not disable user scaling');
  assert.match(html, /rel="manifest"\s+href="\/manifest\.json"/, 'index.html must link to /manifest.json');
});

test('Phase 5 & 6: Security, Auth, Admin allowlist, and Firestore rules', () => {
  const appTsx = readFile('src/App.tsx');
  const firebaseTs = readFile('src/services/firebase.ts');
  assert.match(firebaseTs, /fazle\.rabbe\.doc@gmail\.com/i, 'firebase.ts must include primary admin email');
  assert.match(appTsx, /89056/, 'App.tsx must preserve master passcode 89056');
  assert.match(appTsx, /00000/, 'App.tsx must preserve CV-only passcode 00000');

  const rules = readFile('firestore.rules');
  assert.match(rules, /function isOwner\(userId\)/, 'firestore.rules must enforce isOwner');
  assert.match(rules, /match \/users\/\{userId\}/, 'firestore.rules must scope user data under /users/{userId}');
  assert.match(
    rules,
    /match \/cv_accounts\/\{accountId\}[\s\S]*?allow list, delete:\s*if isSignedIn\(\)/,
    'firestore.rules must restrict list and delete on /cv_accounts to authenticated users'
  );
  assert.match(
    rules,
    /match \/cv_users\/\{phoneNumber\}[\s\S]*?allow list, delete:\s*if isSignedIn\(\)/,
    'firestore.rules must restrict list and delete on /cv_users to authenticated users'
  );
});

test('Phase 7: Job search deduplication & Gmail queue safety invariants', () => {
  const queueService = readFile('src/services/gmailQueueService.ts');
  assert.match(queueService, /DAILY_EMAIL_CAP\s*=\s*40/, 'Daily email cap must be 40');
  assert.match(queueService, /GAP_MIN_MS\s*=\s*45_000/, 'Minimum gap between emails must be 45,000ms');
  assert.match(queueService, /hasEmailAddressBeenContacted/, 'Queue service must prevent duplicate outreach to same email');
  assert.match(queueService, /recoverInterruptedItemsOnStartup/, 'Queue service must recover interrupted sending items');

  const jobService = readFile('src/services/jobSearchService.ts');
  assert.match(jobService, /isDuplicateJob/, 'jobSearchService must deduplicate jobs across sources');
});

test('Phase 9: Android WebViewAssetLoader and Gradle configuration (web Firebase SDK)', () => {
  const mainActivity = readFile('android/app/src/main/java/com/ccd/abetteryou/MainActivity.kt');
  assert.match(mainActivity, /WebViewAssetLoader/, 'MainActivity.kt must use WebViewAssetLoader');
  assert.match(
    mainActivity,
    /https:\/\/appassets\.androidplatform\.net/,
    'MainActivity.kt must configure https://appassets.androidplatform.net origin'
  );
  assert.match(
    mainActivity,
    /\$localAssetOrigin\/index\.html/,
    'MainActivity.kt must load bundled SPA via $localAssetOrigin/index.html'
  );
  assert.doesNotMatch(
    mainActivity,
    /file:\/\/\/android_asset/,
    'MainActivity.kt must not use file:///android_asset URLs that break ES modules'
  );

  const buildGradle = readFile('android/app/build.gradle.kts');
  assert.match(buildGradle, /applicationId\s*=\s*"com\.ccd\.abetteryou"/, 'Application ID must be com.ccd.abetteryou');
  assert.match(buildGradle, /versionCode\s*=\s*1/, 'versionCode must be 1');
  assert.match(buildGradle, /versionName\s*=\s*"1\.0\.0"/, 'versionName must be 1.0.0');

  // This Android wrapper hosts the web app in a WebView and uses the Firebase
  // JavaScript SDK (firebase-applet-config.json). It does not apply the native
  // Google Services Gradle plugin, so google-services.json is not required.
  const appGradle = readFile('android/app/build.gradle.kts');
  assert.doesNotMatch(
    appGradle,
    /com\.google\.gms\.google-services/,
    'WebView wrapper must not require the native Google Services Gradle plugin'
  );
  assert.ok(exists('firebase-applet-config.json'), 'Web Firebase configuration must be present');
});

test('Phase 10 & 12: GitHub workflows and required documentation files exist', () => {
  assert.ok(exists('.github/workflows/build-android-apk.yml'), 'build-android-apk.yml must exist');
  assert.ok(exists('.github/workflows/deploy.yml'), 'deploy.yml must exist');

  const deployYml = readFile('.github/workflows/deploy.yml');
  assert.doesNotMatch(deployYml, /bun install/, 'deploy.yml must use npm instead of broken bun lockfile');
  assert.match(deployYml, /npm run build/, 'deploy.yml must run npm run build');

  const requiredDocs = [
    'README.md',
    'README-BN.txt',
    'docs/README.md',
    'docs/INSTALLATION-BN.md',
    'docs/DEVELOPMENT.md',
    'docs/ARCHITECTURE.md',
    'docs/RELEASES.md',
  ];
  for (const docPath of requiredDocs) {
    assert.ok(exists(docPath), `Required documentation file ${docPath} must exist`);
    assert.ok(readFile(docPath).trim().length > 100, `Documentation file ${docPath} must be non-empty`);
  }
});
