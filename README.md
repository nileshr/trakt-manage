# Trakt History Manager

A utility for managing your Trakt.tv watch history. Clean up duplicates, remove unwanted entries, and audit your viewing data.

## Features

- Remove duplicate watch entries
- Bulk remove plays from specific dates
- Preview changes before making them
- Automatic token management and authentication
- Target movies, episodes, or both

## Prerequisites

- Node.js (v12 or higher) or Bun
- Trakt.tv account and API application

## Setup

1. Clone this repository
2. If using Node.js:
   ```bash
   npm install
   npm start
   ```
   If using Bun:
   ```bash
   bun start
   ```

## Trakt.tv API Setup

1. Go to [Trakt.tv API Settings](https://trakt.tv/oauth/applications)
2. Create a new application:
   - **Name**: Your choice
   - **Redirect URI**: `urn:ietf:wg:oauth:2.0:oob`
   - **Permissions**: Check all boxes
3. Save your **Client ID** and **Client Secret**

## Usage

### First Run
1. Launch the app
2. Enter your Trakt API credentials when prompted
3. Complete the PIN authentication in your browser

Authentication is automatic in subsequent runs using saved tokens.

## Features

### Remove Duplicates
- Find and remove duplicate watch entries
- Preview before making changes
- Keep one entry per day or remove all duplicates

### Date-based Removal
- Remove all plays from a specific date
- Select which entries to keep
- Preview changes before confirming

### View-Only Mode
- Preview duplicates without making changes
- See play counts and dates
- Safe way to audit your data

## Troubleshooting

- Delete `trakt_token.json` to re-authenticate
- Check internet connection and Trakt.tv API status
- Ensure API permissions are correct in your Trakt application

## Contributing

This is a utility script. Feel free to modify for your specific needs:
- Add new operations
- Change output formatting  
- Implement additional filters
- Add error recovery features

## Disclaimer

This tool modifies your Trakt.tv watch history. Always review changes before confirming. The authors are not responsible for data loss. Use at your own risk and consider backing up important data.

## Credits

This project is based on the excellent work of several developers:

- **Primary inspiration**: [TheFacc/Trakt-BulkOps](https://github.com/TheFacc/Trakt-BulkOps)
- **Original concept**: [anthony-foulfoin/trakt-tv-duplicates-removal](https://github.com/anthony-foulfoin/trakt-tv-duplicates-removal)
- **Initial implementation**: [blaulan's gist](https://gist.github.com/blaulan/50d462696bce5da9225b8d596a8c6fb4)

This script converts the Python implementation to JavaScript/Node.js and adds additional features including:
- Smart token management with automatic refresh
- Enhanced authentication flow
- View-only duplicate listing mode
- Improved user interface and confirmations

## License

Use freely for personal purposes. Respect Trakt.tv's Terms of Service and API guidelines.