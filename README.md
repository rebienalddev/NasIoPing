# Render Keep-Alive Service 🚀

Automated GitHub Actions workflow and Node.js script that sends periodic HTTP GET requests to keep your free Render web service active and prevent cold starts.

## 📌 How This Solves GitHub Actions Cron Delays

GitHub Actions' free tier scheduler often delays 5-minute cron triggers (`*/5 * * * *`) when GitHub's servers are busy, causing long gaps between runs.

To ensure your Render web service **NEVER** falls asleep, this project uses an **Active Session Pattern**:

1. **Active 14-Minute Session**: Each GitHub Actions job stays running for **14 minutes** and sends a ping request every **4 minutes** (at 0m, 4m, 8m, and 12m).
2. **Multi-Cron Triggers**: Multiple cron schedules (`*/10 * * * *` and `5,15,25,35,45,55 * * * *`) ensure GitHub Actions continuously launches new runner sessions.
3. **Zero Cold Starts**: Because Render free tier services only sleep after **15 minutes** of inactivity, pinging every 4 minutes inside an active 14-minute session guarantees 100% uptime on GitHub Actions!

---

## ✨ Features

- **Node.js 22 Native Standard**: Built using native `fetch()` and `node:timers/promises` with zero external npm dependencies.
- **Continuous GitHub Coverage**: 14-minute active session window per GitHub Actions run with 4-minute ping intervals.
- **Resilient Retry Logic**: Automatically retries up to 3 times with a 10-second delay between attempts if temporary network errors or non-2xx status codes occur.
- **Rich Console Output**: Logs timestamp (ISO UTC), HTTP status code, response time (ms), pass/fail result, and session cycle count.
- **Manual Triggering**: Supports instant execution via `workflow_dispatch`.

---

## ⚙️ Target Endpoint

The target URL is set at the top of [`ping.js`](ping.js):

```javascript
const TARGET_URL = 'https://nasiobot.onrender.com/';
```

To ping a different endpoint, edit `TARGET_URL` in [`ping.js`](ping.js) and push your changes to GitHub.

---

## 🚀 How to Deploy / Push Changes to GitHub

Commit and push the updated files to your GitHub repository:

```bash
git add .
git commit -m "Update GitHub Actions session strategy for 100% Render uptime"
git push origin main
```

Once pushed to `main`, GitHub Actions will start the active ping session and keep your Render service awake 24/7!
