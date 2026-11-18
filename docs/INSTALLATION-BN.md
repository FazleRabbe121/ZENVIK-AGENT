# ZENVIK-AGENT — বাংলা ইনস্টলেশন ও ব্যবহার নির্দেশিকা

এই গাইডে Android APK, মোবাইল Web App (PWA), Desktop এবং GitHub থেকে আপডেট নেওয়ার নিয়ম দেওয়া হয়েছে।

## ১. Apps & Installation Center কোথায়?

ZENVIK-AGENT খুলে:
- Desktop: বাম পাশের Sidebar-এ **Apps & Installation Center** নির্বাচন করুন।
- Mobile: নিচের Navigation Bar-এ **Apps** অথবা উপরের **Apps** শর্টকাট নির্বাচন করুন।

এই পেজ থেকে APK, Web App install instructions, GitHub Actions, Documentation এবং Update information পাওয়া যাবে।

## ২. Android APK ইনস্টল

**সর্বশেষ APK:** [ZENVIK-AGENT-Android.apk ডাউনলোড](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/download/android-latest/ZENVIK-AGENT-Android.apk)

1. Android ফোনে উপরের APK লিংক খুলে ফাইল ডাউনলোড করুন।
2. ডাউনলোড শেষ হলে APK ফাইলটি খুলুন।
3. Android অনুমতি চাইলে Browser বা Files-এর জন্য **Allow from this source / Install unknown apps** চালু করুন।
4. ফিরে এসে **Install** চাপুন।
5. ইনস্টল শেষ হলে ZENVIK-AGENT খুলুন এবং ইন্টারনেট সংযোগ রাখুন।

এই প্রকল্পের Android build বর্তমানে Debug APK তৈরি করে। এটি পরীক্ষা ও সরাসরি ইনস্টলেশনের জন্য। Play Store প্রকাশের জন্য আলাদা production signing key এবং release configuration প্রয়োজন।

### আপডেট করার সময়

APK হলো bundled native package; GitHub-এ কোড পরিবর্তন করলেই ফোনের ইনস্টল করা APK নিজে থেকে বদলায় না।

1. নতুন কোড main branch-এ push হলে Android workflow চালু হয় (পরিবর্তিত ফাইল workflow-এর trigger path-এর মধ্যে থাকতে হবে)।
2. Build সফল হলে GitHub Release-এর android-latest asset আপডেট হয়।
3. Apps Center বা উপরের Latest APK লিংক থেকে নতুন APK ডাউনলোড করুন।
4. একই signing certificate হলে Android পুরোনো ইনস্টলেশনের ওপর update করতে পারে। GitHub-hosted Debug build-এ runner-এর debug signing key বদলে গেলে update ব্যর্থ হতে পারে; সে ক্ষেত্রে পুরোনো Debug app uninstall করে নতুন APK install করতে হবে। Uninstall করলে local-only app data মুছে যেতে পারে; আগে cloud sync/backup নিশ্চিত করুন।

## ৩. Android Chrome থেকে Web App ইনস্টল (PWA)

PWA আলাদা APK নয়। এটি ওয়েবসাইটকে Home Screen-এ app-এর মতো খুলতে দেয়।

1. Chrome দিয়ে [ZENVIK-AGENT Web App](https://fazlerabbe121.github.io/ZENVIK-AGENT/) খুলুন।
2. Chrome-এর উপরের ডানদিকে **⋮** মেনু চাপুন।
3. **Install app** অথবা **Add to Home screen** নির্বাচন করুন।
4. Install / Add চাপুন।
5. Home Screen-এ ZENVIK আইকন থেকে খুলুন।

Browser, Android version এবং site installability অনুযায়ী মেনুর শব্দ ভিন্ন হতে পারে। **Install app** না দেখালে Chrome আপডেট করুন, সাইটটি HTTPS-এ খুলুন, তারপর browser menu থেকে **Add to Home screen** চেষ্টা করুন।

## ৪. iPhone / iPad

1. Safari-তে Web App URL খুলুন।
2. **Share** বাটন চাপুন।
3. **Add to Home Screen** নির্বাচন করুন।
4. নাম যাচাই করে **Add** চাপুন।

iOS-এ এটি Home Screen web app; Android APK ইনস্টল হয় না।

## ৫. Windows / macOS Desktop

এখন আলাদা native Windows EXE বা macOS DMG installer প্রকাশ করা হয় না।

1. Chrome বা Edge-এ Web App URL খুলুন।
2. Address bar-এর Install icon অথবা browser menu → **Install ZENVIK-AGENT** নির্বাচন করুন।
3. Desktop/Start Menu shortcut থেকে খুলুন।

## ৬. Web App এবং APK Update-এর পার্থক্য

| ধরন | Update পদ্ধতি |
|---|---|
| Website | GitHub Pages deployment সফল হলে নতুন website files publish হয় |
| Installed PWA | Internet-এ reconnect করে app refresh/reopen করলে নতুন published website load হয় |
| Android APK | নতুন APK build করে download ও install করতে হয়; automatic silent update নেই |

এই Android wrapper bundled dist files চালায়। তাই APK নিজে থেকে GitHub-এর সঙ্গে code update sync করে না।

## ৭. GitHub-এ কোড পরিবর্তন

Repository: https://github.com/FazleRabbe121/ZENVIK-AGENT

1. GitHub-এ repository খুলুন।
2. main branch-এ পরিবর্তন commit/push করুন।
3. **Actions** ট্যাবে যান।
4. **Deploy to GitHub Pages** workflow website publish করে।
5. Source, public assets, Android files বা build workflow-এর পরিবর্তনে **Build ZENVIK Android APK** workflow চালু হয়।
6. Android Build সফল হলে workflow summary-তে **Success** এবং **Artifacts: 1** দেখতে পাবেন। Release asset-ও আপডেট হবে।

### “Not published” মানে কী?

GitHub Actions summary-র **Build Scan: Not published** মানে Gradle Build Scan report প্রকাশ হয়নি। এটি APK publish না হওয়ার প্রমাণ নয়। APK যাচাই করতে **Build Outcome**, **Artifacts**, এবং android-latest Release দেখুন।

## ৮. পরিচিত প্রযুক্তিগত তথ্য

- Android package ID (release): com.ccd.abetteryou
- Debug APK application ID: com.ccd.abetteryou.debug
- Minimum Android version: Android 8.0 / API 26
- App version in Android Gradle config: 1.0.0
- Launcher icon, adaptive icon এবং splash styling Android resources-এ নির্ধারিত।
- Google sign-in, Firebase, cloud storage, AI APIs, Gmail/Drive এবং backend-dependent features-এর জন্য সঠিক provider configuration, authorization, security rules এবং online backend প্রয়োজন।

## ৯. সমস্যা হলে

- **কালো/ফাঁকা স্ক্রিন:** Android System WebView ও Chrome আপডেট করুন; ইন্টারনেট পরীক্ষা করুন; Apps Center থেকে সর্বশেষ APK ব্যবহার করুন।
- **APK install blocked:** Android Settings-এ Browser/Files-এর Install unknown apps অনুমতি দিন।
- **APK update rejected:** আগের Debug APK uninstall করে নতুনটি install করুন; আগে cloud backup নিশ্চিত করুন।
- **Google login fail:** Firebase Authentication-এ সঠিক Authorized Domains, Google provider এবং OAuth configuration পরীক্ষা করতে হবে।
- **Cloud data না আসে:** Firebase project, Firestore rules, network এবং signed-in account পরীক্ষা করতে হবে।
- **AI/API feature fail:** server-side API secret ও backend host configuration পরীক্ষা করুন। Browser bundle-এ private API key রাখবেন না।

কোনো feature-কে verified বলা যাবে শুধু বাস্তবে test পাস করার পর।
