# ZENVIK-AGENT — বিস্তারিত ইনস্টলেশন গাইড (Bengali Installation Guide)

এই গাইডে **ZENVIK-AGENT** অ্যাপটি Android ফোন, iPhone (iOS), Windows পিসি এবং Mac-এ ইনস্টল করার সম্পূর্ণ ধাপগুলো বাংলায় দেওয়া হলো।

---

## ১. Android ফোনে সরাসরি APK ইনস্টল (Recommended for Android)

১. আপনার ফোন থেকে অ্যাপের **Apps & Installation Center** ওপেন করুন অথবা সরাসরি নিচের লিংকে যান:
   - [ZENVIK-AGENT-debug.apk ডাউনলোড করুন](https://github.com/FazleRabbe121/ZENVIK-AGENT/releases/latest/download/ZENVIK-AGENT-debug.apk)
২. ডাউনলোড শেষ হলে নোটিফিকেশন বার বা **Downloads** ফোল্ডার থেকে `ZENVIK-AGENT-debug.apk` ফাইলটিতে ট্যাপ করুন।
৩. যদি আপনার ফোনে **"For your security, your phone currently isn't allowed to install unknown apps"** মেসেজ দেখায়:
   - **Settings**-এ ট্যাপ করুন।
   - **Allow from this source** সুইচটি অন করুন।
৪. **Install** বাটনে ট্যাপ করুন।
৫. যদি Google Play Protect থেকে **"Unrecognized app developer"** ওয়ার্নিং দেখায় (যেহেতু এটি সরাসরি গিটহাব ডিবাগ বিল্ড), তাহলে **More details** -> **Install anyway**-তে ট্যাপ করুন।

---

## ২. Android ফোনে ব্রাউজার থেকে PWA ইনস্টল (কোনো APK ছাড়াই)

১. **Google Chrome** ব্রাউজারে অ্যাপের ওয়েব লিংকটি ওপেন করুন:
   - `https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app`
২. মেনু থেকে **Apps & Installation Center**-এ যান এবং **Install Web App Now** বাটনে ট্যাপ করুন।
৩. বিকল্পভাবে, Chrome-এর উপরে ডানপাশে তিন ডট (`⋮`) মেনুতে ট্যাপ করে **Install app** বা **Add to Home screen** সিলেক্ট করুন।

---

## ৩. iPhone ও iPad (iOS)-এ ইনস্টল করার নিয়ম

অ্যাপল (iOS) ডিভাইসে `.apk` ফাইল চলে না। iPhone বা iPad-এ নেটিভ ফুল-স্ক্রিন অ্যাপ হিসেবে ব্যবহার করতে:

১. অবশ্যই **Safari** ব্রাউজারে অ্যাপের ওয়েব লিংকটি ওপেন করুন।
২. স্ক্রিনের নিচে মাঝখানে থাকা **Share** আইকনে (উপরে তীর চিহ্ন দেওয়া বক্স) ট্যাপ করুন।
৩. মেনুতে নিচে স্ক্রল করে **Add to Home Screen** অপশনটিতে ট্যাপ করুন।
৪. উপরে ডানপাশে **Add** বাটনে ট্যাপ করুন। এখন আপনার হোম স্ক্রিনে ZENVIK আইকন চলে আসবে।

---

## ৪. Windows 10/11 ও macOS কম্পিউটারে ডেস্কটপ অ্যাপ হিসেবে ইনস্টল

১. কম্পিউটারে **Google Chrome** বা **Microsoft Edge** ব্রাউজারে অ্যাপটি ওপেন করুন।
২. অ্যাপের ভেতরে **Apps & Installation Center**-এ গিয়ে **Install Web App Now** বাটনে ক্লিক করুন।
৩. অথবা ব্রাউজারের অ্যাড্রেস বারের (URL বারের) ডানপাশে থাকা ছোট কম্পিউটার/ডাউনলোড আইকনে ক্লিক করে **Install** চাপুন।
৪. এটি আপনার স্টার্ট মেনু (Windows) বা Applications ফোল্ডার (Mac)-এ যুক্ত হয়ে যাবে।

---

## ৫. Windows কম্পিউটার ও USB ক্যাবল দিয়ে নিজের ফোনে APK বিল্ড ও ইনস্টল

আপনি যদি নিজের কম্পিউটার থেকে সোর্স কোড কম্পাইল করে সরাসরি ফোনে ইনস্টল করতে চান:

১. অ্যাপের **Apps & Installation Center** থেকে **Download Full Project (.ZIP)** বাটনে ক্লিক করে জিপ ফাইলটি নামিয়ে আনজিপ করুন।
২. প্রথমবার সেটআপের জন্য `SETUP_ANDROID_ENVIRONMENT.bat` ফাইলটিতে ডাবল-ক্লিক করুন।
৩. ফোনে **Developer Options** -> **USB Debugging** চালু করে USB ক্যাবল দিয়ে পিসিতে কানেক্ট করুন।
৪. `CHECK_ANDROID_DEVICE.bat` চালিয়ে ফোনটি কানেক্ট হয়েছে কিনা নিশ্চিত করুন।
৫. `BUILD_AND_INSTALL.bat`-এ ডাবল-ক্লিক করুন—এটি ওয়েব অ্যাপ বিল্ড করে স্বয়ংক্রিয়ভাবে আপনার ফোনে APK ইনস্টল করে দেবে।

---

## ৬. Gmail OAuth "Access Blocked / Error 403" সমস্যার সমাধান

Gmail কানেক্ট করার সময় যদি Google থেকে **Access blocked: This app's request is invalid** বা **Error 403: access_denied** দেখায়:

১. [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent)-এ যান।
২. **OAuth consent screen** থেকে **Test users** সেকশনে আপনার ইমেইল (`fazle.rabbe.doc@gmail.com` এবং যে ইমেইল দিয়ে লগইন করছেন) যোগ করুন।
৩. **APIs & Services -> Library** থেকে **Gmail API** Enable করা আছে কিনা নিশ্চিত করুন।
৪. **Credentials -> OAuth 2.0 Client IDs**-এ আপনার ওয়েব অ্যাপের ডোমেইন (`https://ais-pre-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app` এবং `https://ais-dev-3gibrfsvo4w6s27pi4qcyj-889586963829.europe-west2.run.app`) **Authorized JavaScript origins** ও **Authorized redirect URIs**-এ যুক্ত করুন।
