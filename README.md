# Trakt History Manager

A Node.js utility for managing your Trakt.tv watch history. Clean up duplicates, remove unwanted entries, and audit your viewing data with ease.

## Features

- **Duplicate Management**: Find and remove duplicate watch entries
- **Date-based Removal**: Bulk remove all plays from specific dates
- **View-Only Mode**: Preview duplicates without making changes
- **Automatic Authentication**: Smart token management with refresh capability
- **Interactive Interface**: User-friendly prompts and confirmations
- **Flexible Filtering**: Target movies, episodes, or both

## Prerequisites

- Node.js (v12 or higher)
- Trakt.tv account
- Trakt.tv API application

## Installation

1. Clone or download the script
2. Install dependencies:
   ```bash
   npm install axios
   ```

## Trakt.tv API Setup

1. Go to [Trakt.tv API Settings](https://trakt.tv/oauth/applications)
2. Create a new application with these settings:
   - **Name**: Any name you prefer
   - **Redirect URI**: `urn:ietf:wg:oauth:2.0:oob`
   - **Permissions**: Check all boxes
3. Note your **Client ID** and **Client Secret**

## Usage

Run the script:
```bash
node trakt-manager.js
```

### First Run
- Enter your Trakt API credentials (saved for future use)
- Complete PIN authentication in browser
- Tokens are automatically saved and refreshed

### Subsequent Runs
- Authentication happens automatically using saved tokens
- PIN required only if tokens expire or refresh fails

## Operations

### 1. Remove Duplicate Plays
- Finds entries watched multiple times
- Shows preview before removal
- Option to keep one entry per day or remove all duplicates
- Requires confirmation before deletion

### 2. Remove Plays from Specific Date
- Target all plays from a particular date (YYYY-MM-DD format)
- Interactive selection of which entries to keep/remove
- Detailed preview with movie/episode information

### 3. List Duplicates (View-Only)
- Preview duplicates without making changes
- Groups by movie/episode title
- Shows play counts and dates
- Safe way to audit your data

## Content Types

Choose what to process:
- **Movies only**: Target movie duplicates/entries
- **Episodes only**: Target TV episode duplicates/entries  
- **Both**: Process movies and episodes together

## File Management

The script creates several files:

### Configuration Files
- `trakt_credentials.json` - Your API credentials
- `trakt_token.json` - Authentication tokens (auto-refreshed)

### Data Exports
- `movies.json` - Complete movie watch history
- `episodes.json` - Complete episode watch history

## Authentication Flow

```
Existing valid tokens? → Use immediately
    ↓ No
Refresh token available? → Refresh and use
    ↓ No  
PIN authentication → Save new tokens
```

## Safety Features

- **Preview before action**: All destructive operations show what will be changed
- **User confirmation**: Multiple confirmation prompts prevent accidents
- **Data backup**: Watch history exported to JSON files before changes
- **Selective removal**: Choose specific entries to keep when removing by date

## Example Output

### Duplicate Listing
```
📽️  The Matrix (1999) - 3 plays:
   1. 2024-01-15T20:30:00.000Z
   2. 2024-01-16T19:45:00.000Z  
   3. 2024-02-20T21:00:00.000Z

📺 Breaking Bad - S01E01 - Pilot - 2 plays:
   1. 2024-01-10T22:00:00.000Z
   2. 2024-01-11T20:30:00.000Z
```

### Date-based Removal
```
[0] 2024-01-15T20:30:00.000Z - The Matrix (1999)
[1] 2024-01-15T22:15:00.000Z - Breaking Bad - S01E01 - Pilot

- Enter 'y' to remove all plays listed above
- Enter 'n' to cancel and exit  
- Enter '0' to keep The Matrix and remove Breaking Bad
```

## Error Handling

- Network errors are caught and reported
- Invalid API responses trigger retry logic
- Authentication failures fall back to PIN method
- File operation errors are handled gracefully

## Security Notes

- API credentials stored locally in plain text
- Tokens automatically refreshed every 24 hours
- No sensitive data transmitted except to Trakt.tv API
- Delete credential files to reset authentication

## Troubleshooting

### Authentication Issues  
- Delete `trakt_token.json` to force re-authentication
- Verify API credentials in `trakt_credentials.json`
- Check Trakt.tv API application settings

### Network Errors
- Verify internet connection
- Check Trakt.tv API status
- Rate limiting may cause temporary failures

### Missing Data
- Ensure Trakt account has watch history
- Verify API permissions in Trakt application settings
- Check that username matches Trakt profile

## Limitations

- Rate limited by Trakt.tv API (reasonable usage recommended)
- Large histories may take time to process
- Requires active internet connection
- PIN authentication expires and needs renewal

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