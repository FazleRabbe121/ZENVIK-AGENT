ZENVIK-AGENT Android build patch

এই ZIP-এর ফাইলগুলো repository root-এ একই path অনুযায়ী বসাতে হবে:
- package.json
- capacitor.config.ts
- vite.config.ts
- .github/workflows/build-android-apk.yml

তারপর GitHub-এ commit করে Actions থেকে Build Android APK চালাতে হবে।

সতর্কতা:
1) এটি configuration patch, সম্পূর্ণ source repository নয় এবং APK নয়।
2) GitHub connector দিয়ে সরাসরি commit করার চেষ্টা 403 permission error-এ ব্যর্থ হয়েছে।
3) পুরো application source, Firebase integration, backend/API এবং runtime behaviour যাচাই করতে সম্পূর্ণ repository ZIP প্রয়োজন।
4) Repository-তে capacitor.config.ts আগে না থাকলে এই ZIP সেটি যোগ করে।
