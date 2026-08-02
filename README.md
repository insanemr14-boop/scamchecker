# ScamChecker

A website safety checker that analyzes domains for potential scams by checking:
- 🔴 **Reddit** - User discussions and warnings
- 🔍 **Google Search** - Reviews, complaints, and scam reports
- 📅 **Domain Age** - WHOIS registration date analysis
- 🔒 **SSL Certificate** - TLS/SSL validity and configuration
- 🛡️ **Reputation Databases** - PhishTank, URLVoid, VirusTotal
- 🌐 **DNS Records** - SPF, DMARC, CAA, and security records

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
# Install all dependencies (root, client, and server)
npm run install:all
```

### Development

```bash
# Run both client and server concurrently
npm run dev

# Or run separately:
npm run dev:client  # Client on http://localhost:5173
npm run dev:server  # Server on http://localhost:3001
```

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

Copy the example file and add your API keys:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your API keys:

| Variable | Required | Description |
|----------|----------|-------------|
| `REDDIT_CLIENT_ID` | No | Reddit API client ID |
| `REDDIT_CLIENT_SECRET` | No | Reddit API client secret |
| `SERPER_API_KEY` | No | Serper.dev Google Search API key |
| `GOOGLE_API_KEY` | No | Google Custom Search API key |
| `GOOGLE_CSE_ID` | No | Google Custom Search Engine ID |
| `PHISHTANK_API_KEY` | No | PhishTank API key |
| `URLVOID_API_KEY` | No | URLVoid API key |
| `VIRUSTOTAL_API_KEY` | No | VirusTotal API key |

**Note:** The tool works without API keys but with limited functionality (checks will show "API not configured").

### Getting API Keys

- **Reddit**: https://www.reddit.com/prefs/apps (create a "script" app)
- **Serper** (recommended for Google): https://serper.dev/
- **Google CSE**: https://developers.google.com/custom-search/v1/overview
- **PhishTank**: https://phishtank.org/developer_info.php
- **URLVoid**: https://www.urlvoid.com/api/
- **VirusTotal**: https://www.virustotal.com/gui/sign-up

## Project Structure

```
scam-checker/
├── client/                 # React + Vite frontend
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── App.jsx         # Main application component
│   │   ├── App.css         # All styles
│   │   ├── main.jsx        # Entry point
│   │   └── index.css       # Global styles & CSS variables
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/                 # Express.js backend
│   ├── checks/             # Individual check modules
│   │   ├── reddit.js
│   │   ├── google.js
│   │   ├── domain.js
│   │   ├── ssl.js
│   │   ├── reputation.js
│   │   └── dns.js
│   ├── index.js            # Express server & API routes
│   ├── package.json
│   └── .env.example
├── package.json            # Root workspace config
├── .gitignore
└── README.md
```

## API Endpoints

- `POST /api/check` - Run all checks on a URL
  ```json
  { "url": "https://example.com" }
  ```
- `GET /api/health` - Health check

## Features

- **Risk Assessment**: Automatic overall risk rating (Safe / Caution / Dangerous)
- **Expandable Details**: Click any check to see raw data
- **External Links**: Direct links to WHOIS, SSL Labs, VirusTotal, etc.
- **Caching**: 1-hour cache to reduce API calls
- **Dark/Light Mode**: Automatic based on system preference
- **Responsive**: Works on mobile and desktop
- **Accessible**: Semantic HTML, ARIA labels, keyboard navigation

## Tech Stack

- **Frontend**: React 18, Vite, Lucide React icons
- **Backend**: Node.js, Express, ES Modules
- **APIs**: Reddit OAuth, Serper/Google CSE, WHOIS, SSL, DNS, PhishTank, URLVoid, VirusTotal

## License

MIT - Educational tool for website safety awareness